import {
  digest,
  secret,
  equal,
  emailAddress,
  hashPassword,
  verifyPassword,
  inputText,
  fail,
} from './security.js'

const accountSelect = `SELECT c.CredentialId, c.PatronId, c.StaffUserName, c.PasswordHash,
  COALESCE(p.Email,u.Email) Email, COALESCE(p.Name,u.Name) Name, u.isAdmin,
  COALESCE(p.Salt,u.Salt) Salt, COALESCE(p.HashPW,u.HashPW) HashPW
  FROM dbo.EGCredentials c LEFT JOIN dbo.Patrons p ON p.UserID=c.PatronId
  LEFT JOIN dbo.[User] u ON u.UserName=c.StaffUserName`
export const publicAccount = (row) =>
  row
    ? {
        id: String(row.CredentialId),
        patronId: row.PatronId ? String(row.PatronId) : null,
        username: row.StaffUserName || null,
        name: row.Name,
        email: row.Email,
        role: row.PatronId ? 'customer' : row.isAdmin ? 'admin' : 'employee',
      }
    : null

export function createAccounts(database, { production = false, accountSetup = {} } = {}) {
  const cookieName = 'eg_original_session'
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  }
  const cookieValue = (req) =>
    req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1)

  async function session(req) {
    const token = cookieValue(req)
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null
    const pool = await database.getPool()
    const { recordset } = await pool.request().input('hash', digest(token)).query(`
      SELECT SessionHash,CsrfToken,CredentialId FROM dbo.EGSessions
      WHERE SessionHash=@hash AND ExpiresAt>SYSUTCDATETIME()`)
    const row = recordset[0]
    if (!row) return null
    const account = row.CredentialId
      ? (
          await pool
            .request()
            .input('id', row.CredentialId)
            .query(accountSelect + ' WHERE c.CredentialId=@id')
        ).recordset[0]
      : null
    return { hash: row.SessionHash, csrf: row.CsrfToken, user: publicAccount(account) }
  }
  async function issue(req, res, credentialId = null) {
    const token = secret(),
      csrf = secret()
    const pool = await database.getPool()
    const old = cookieValue(req)
    // Rotate the opaque cookie after authentication; persist only its hash in SQL.
    await pool
      .request()
      .input('hash', digest(token))
      .input('csrf', csrf)
      .input('id', credentialId)
      .input('old', old ? digest(old) : '').query(`
      DELETE dbo.EGSessions WHERE SessionHash=@old OR ExpiresAt<SYSUTCDATETIME();
      INSERT dbo.EGSessions(SessionHash,CredentialId,CsrfToken,ExpiresAt)
      VALUES(@hash,@id,@csrf,DATEADD(hour,12,SYSUTCDATETIME()));`)
    res.cookie(cookieName, token, cookieOptions)
    const row = credentialId
      ? (
          await pool
            .request()
            .input('id', credentialId)
            .query(accountSelect + ' WHERE c.CredentialId=@id')
        ).recordset[0]
      : null
    return { user: publicAccount(row), csrf }
  }
  async function logout(req, res) {
    if (req.session)
      await (await database.getPool())
        .request()
        .input('hash', req.session.hash)
        .query('DELETE dbo.EGSessions WHERE SessionHash=@hash')
    res.clearCookie(cookieName, cookieOptions)
    return { user: null }
  }
  async function register(body, role = 'customer') {
    const email = emailAddress(body?.email),
      name = inputText(body?.name, 'name')
    if (body?.role && body.role !== role)
      fail('Public registration creates customer accounts only.', 403)
    const username = role !== 'customer' ? inputText(body?.username, 'staff username', 50) : null
    const passwordHash = await hashPassword(body?.password)
    const tx = (await database.getPool()).transaction()
    await tx.begin()
    try {
      // Serialize account creation across both course account tables, including legacy records.
      await tx
        .request()
        .query(
          "DECLARE @locked int; EXEC @locked=sys.sp_getapplock @Resource=N'EG-account-registration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; IF @locked<0 THROW 51000,'Account registration is busy',1",
        )
      const exists = await tx.request().input('email', email).input('username', username).query(`
        SELECT Email,UserID PatronId FROM dbo.Patrons WHERE LOWER(Email)=@email
        UNION ALL SELECT Email,NULL FROM dbo.[User] WHERE LOWER(Email)=@email OR UserName=@username`)
      let patronId = null
      // A local administrator may invite one incomplete account to choose its first password.
      // Email alone never authorizes claiming a record or its existing order history.
      if (
        role === 'customer' &&
        exists.recordset.length === 1 &&
        exists.recordset[0].PatronId &&
        email === accountSetup.email &&
        Date.parse(accountSetup.expiresAt) > Date.now() &&
        /^[a-f0-9]{64}$/.test(body?.setupToken || '') &&
        equal(digest(body.setupToken), accountSetup.tokenHash)
      ) {
        const pending = await tx
          .request()
          .input('id', Number(exists.recordset[0].PatronId))
          .input('email', email).query(`
            SELECT UserID FROM dbo.Patrons p WITH(UPDLOCK,HOLDLOCK)
            WHERE UserID=@id AND Salt IS NULL AND HashPW IS NULL
            AND NOT EXISTS(SELECT 1 FROM dbo.EGCredentials WHERE PatronId=@id OR LOWER(Email)=@email)`)
        patronId = pending.recordset[0]?.UserID || null
      }
      if (exists.recordset.length && !patronId)
        fail(
          role === 'customer'
            ? 'This email is already registered. Sign in with your existing password, or use a different email to create a new account.'
            : 'An account with that email or staff username already exists.',
          409,
        )
      if (role === 'customer') {
        if (patronId) {
          await tx
            .request()
            .input('id', Number(patronId))
            .input('name', name)
            .input('email', email)
            .query('UPDATE dbo.Patrons SET Name=@name,Email=@email WHERE UserID=@id')
        } else
          patronId = (
            await tx
              .request()
              .input('email', email)
              .input('name', name)
              .query(
                'INSERT dbo.Patrons(Email,Name) OUTPUT INSERTED.UserID id VALUES(@email,@name)',
              )
          ).recordset[0].id
      } else {
        await tx
          .request()
          .input('email', email)
          .input('name', name)
          .input('username', username)
          .input('admin', role === 'admin')
          .query(
            'INSERT dbo.[User](UserName,Email,Name,isAdmin) VALUES(@username,@email,@name,@admin)',
          )
      }
      const result = await tx
        .request()
        .input('patron', patronId ? Number(patronId) : null)
        .input('staff', username)
        .input('email', email)
        .input('password', passwordHash).query(`
        INSERT dbo.EGCredentials(PatronId,StaffUserName,Email,PasswordHash)
        OUTPUT INSERTED.CredentialId id VALUES(@patron,@staff,@email,@password)`)
      await tx.commit()
      return Number(result.recordset[0].id)
    } catch (error) {
      await tx.rollback().catch(() => {})
      throw error
    }
  }
  async function login(body) {
    const login = inputText(body?.login, 'email or staff username').toLowerCase()
    const pool = await database.getPool()
    const existing = await pool
      .request()
      .input('login', login)
      .query(accountSelect + ' WHERE LOWER(c.Email)=@login OR LOWER(c.StaffUserName)=@login')
    if (existing.recordset.length === 1) {
      if (!(await verifyPassword(body.password, existing.recordset[0])))
        fail('Email, username or password is incorrect.', 401)
      return Number(existing.recordset[0].CredentialId)
    }
    // The course hashes are verified as documented; no guessed passwords or password resets.
    const legacy = await pool.request().input('login', login).query(`
      SELECT UserID PatronId, CAST(NULL AS nvarchar(50)) StaffUserName, Email, Salt, HashPW FROM dbo.Patrons WHERE LOWER(Email)=@login
      UNION ALL SELECT NULL, UserName, Email, Salt, HashPW FROM dbo.[User] WHERE LOWER(Email)=@login OR LOWER(UserName)=@login`)
    if (
      legacy.recordset.length !== 1 ||
      !(await verifyPassword(body?.password, legacy.recordset[0]))
    )
      fail('Email, username or password is incorrect.', 401)
    const row = legacy.recordset[0]
    const tx = pool.transaction()
    await tx.begin()
    try {
      const found = await tx
        .request()
        .input('patron', row.PatronId ? Number(row.PatronId) : null)
        .input('staff', row.StaffUserName)
        .input('email', row.Email).query(`
        SELECT CredentialId id FROM dbo.EGCredentials WITH(UPDLOCK,HOLDLOCK) WHERE PatronId=@patron OR StaffUserName=@staff;
        IF NOT EXISTS(SELECT 1 FROM dbo.EGCredentials WHERE PatronId=@patron OR StaffUserName=@staff)
          INSERT dbo.EGCredentials(PatronId,StaffUserName,Email) OUTPUT INSERTED.CredentialId id VALUES(@patron,@staff,@email);`)
      const id = found.recordsets.flat().find((v) => v.id)?.id
      await tx.commit()
      return Number(id)
    } catch (error) {
      await tx.rollback().catch(() => {})
      throw error
    }
  }
  async function updateProfile(session, body) {
    const user = session.user,
      name = inputText(body?.name, 'name'),
      email = emailAddress(body?.email ?? user.email),
      passwordHash = body?.password === undefined ? null : await hashPassword(body.password)
    const tx = (await database.getPool()).transaction()
    await tx.begin()
    try {
      // Share registration's lock so a profile edit cannot claim an email being registered.
      await tx
        .request()
        .query(
          "DECLARE @locked int; EXEC @locked=sys.sp_getapplock @Resource=N'EG-account-registration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; IF @locked<0 THROW 51000,'Account update is busy',1",
        )
      const current = (
        await tx
          .request()
          .input('id', Number(user.id))
          .query(accountSelect + ' WHERE c.CredentialId=@id')
      ).recordset[0]
      if (!current?.PatronId || String(current.PatronId) !== user.patronId)
        fail('Sign in to your customer account again.', 401)
      const sensitive = email !== current.Email.toLowerCase() || passwordHash !== null
      if (sensitive && !(await verifyPassword(body?.currentPassword, current)))
        fail('Your current password is incorrect.')
      const duplicate = await tx
        .request()
        .input('email', email)
        .input('patron', Number(user.patronId)).query(`
        SELECT Email FROM dbo.Patrons WHERE LOWER(Email)=@email AND UserID<>@patron
        UNION ALL SELECT Email FROM dbo.[User] WHERE LOWER(Email)=@email`)
      if (duplicate.recordset.length) fail('An account with that email already exists.', 409)
      // Change the profile and login identity together. Existing order contact details stay intact.
      await tx
        .request()
        .input('id', Number(user.id))
        .input('patron', Number(user.patronId))
        .input('name', name)
        .input('email', email)
        .input('password', passwordHash).query(`
          UPDATE dbo.Patrons SET Name=@name,Email=@email WHERE UserID=@patron;
          UPDATE dbo.EGCredentials SET Email=@email,PasswordHash=COALESCE(@password,PasswordHash)
          WHERE CredentialId=@id;`)
      // Keep this browser signed in, but revoke other sessions after a credential change.
      if (sensitive)
        await tx
          .request()
          .input('id', Number(user.id))
          .input('session', session.hash)
          .query('DELETE dbo.EGSessions WHERE CredentialId=@id AND SessionHash<>@session')
      await tx.commit()
      return { user: { ...user, name, email } }
    } catch (error) {
      await tx.rollback().catch(() => {})
      throw error
    }
  }
  return { session, issue, logout, register, login, updateProfile }
}

export function requireRole(req, ...roles) {
  if (!req.session?.user) fail('Sign in to continue.', 401)
  if (!roles.includes(req.session.user.role)) fail('Your account cannot perform this action.', 403)
  return req.session.user
}
export function requireCsrf(req, origins) {
  if (
    (req.headers.origin && !origins.includes(req.headers.origin)) ||
    !req.session ||
    !equal(req.headers['x-csrf-token'], req.session.csrf)
  )
    fail('Your session has changed. Reload the page and try again.', 403)
}

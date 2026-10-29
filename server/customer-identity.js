import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { validCustomerEmail } from '../src/data/customerEmail.js'

// AI-assisted customer-account extension. Preserve the supplied SQL schema and hash format.
export const fingerprint = (row) =>
  createHash('sha256')
    .update(JSON.stringify([row.Email.toLowerCase(), row.Salt, row.HashPW]))
    .digest('hex')
export const tokenDigest = (token) => createHash('sha256').update(token).digest('hex')
export function accountError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}
export function validAccountPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[a-z]/i.test(password) &&
    /\d/.test(password)
  )
}
export function matchesPassword(password, row) {
  if (typeof password !== 'string' || password.length > 128 || !row?.Salt || !row?.HashPW)
    return false
  const actual = createHash('sha256')
    .update(row.Salt + password, 'utf8')
    .digest('hex')
  const expected = String(row.HashPW).toLowerCase()
  return (
    expected.length === actual.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
}
export function profileValues(body) {
  if (!body || Object.keys(body).some((key) => !['name', 'email', 'currentPassword'].includes(key)))
    throw accountError('Send only name, email and current password.')
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (
    !name ||
    name.length > 100 ||
    [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw accountError('Enter your full name (up to 100 characters).')
  if (!validCustomerEmail(body.email)) throw accountError('Enter a valid email address.')
  if (
    typeof body.currentPassword !== 'string' ||
    !body.currentPassword ||
    body.currentPassword.length > 128
  )
    throw accountError('Enter your current password.')
  return { name, email: body.email.trim().toLowerCase(), currentPassword: body.currentPassword }
}

// All ownership comes from the verified cookie. Never accept a target ID or role from the form.
export function customerIdentityRepository(database) {
  const columns = 'UserID,Name,Email,Salt,HashPW'
  return {
    async findById(id) {
      const result = await (await database.getPool())
        .request()
        .input('id', id)
        .query(`SELECT ${columns} FROM dbo.Patrons WHERE UserID=@id`)
      return result.recordset[0]
    },
    async findByEmail(email) {
      const result = await (await database.getPool())
        .request()
        .input('email', email)
        .query(`SELECT ${columns} FROM dbo.Patrons WHERE LOWER(Email)=@email`)
      // Ambiguous legacy duplicates must not reset an arbitrary account.
      return result.recordset.length === 1 ? result.recordset[0] : undefined
    },
    async updateProfile(id, values) {
      const tx = (await database.getPool()).transaction()
      await tx.begin()
      try {
        // Consistent lock order serializes competing email changes, including duplicate checks.
        const rows = (
          await tx
            .request()
            .query(`SELECT ${columns} FROM dbo.Patrons WITH (UPDLOCK,HOLDLOCK) ORDER BY UserID`)
        ).recordset
        const actor = rows.find((row) => row.UserID === id)
        if (!actor) throw accountError('Your account is unavailable. Sign in again.', 401)
        if (!matchesPassword(values.currentPassword, actor))
          throw accountError('Your current password is incorrect.', 403)
        const duplicates = await tx
          .request()
          .input('id', id)
          .input('email', values.email)
          .query('SELECT UserID FROM dbo.Patrons WHERE UserID<>@id AND Email=@email')
        if (duplicates.recordset.length)
          throw accountError('That email address is already in use.', 409)
        const result = await tx
          .request()
          .input('id', id)
          .input('name', values.name)
          .input('email', values.email)
          .query(
            `UPDATE dbo.Patrons SET Name=@name,Email=@email OUTPUT INSERTED.${columns.split(',').join(',INSERTED.')} WHERE UserID=@id`,
          )
        await tx.commit()
        return result.recordset[0]
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async resetPassword(record, password) {
      const salt = randomBytes(16).toString('hex')
      const hash = createHash('sha256')
        .update(salt + password, 'utf8')
        .digest('hex')
      // Compare-and-swap makes concurrent reset redemption single-use across requests.
      const result = await (await database.getPool())
        .request()
        .input('id', record.UserID)
        .input('email', record.Email)
        .input('oldSalt', record.Salt)
        .input('oldHash', record.HashPW)
        .input('salt', salt)
        .input('hash', hash)
        .query(`UPDATE dbo.Patrons SET Salt=@salt,HashPW=@hash OUTPUT INSERTED.UserID
          WHERE UserID=@id AND Email=@email AND Salt=@oldSalt AND HashPW=@oldHash`)
      if (!result.recordset.length) throw accountError('Invalid or expired reset code.', 400)
    },
  }
}

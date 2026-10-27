import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'

const notFound = {
  status: 'not-found',
  message:
    'No committed result was found. Retry the same submission to resolve this attempt safely.',
}

/** A persistent write-ahead receipt avoids changing the university schema.
 * SQL application locks serialize each attempt across processes. An approved receipt is staged
 * before COMMIT, then checked against its real OrderID after a crash or lost commit response.
 * The journal directory must be persistent and shared by all instances using this database. */
export function createCheckoutJournal(directory) {
  const root = resolve(directory)
  function path(token) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(token))
      throw new Error('Invalid checkout reference')
    return resolve(root, token.toLowerCase() + '.json')
  }
  async function write(token, record) {
    // Write and flush a temporary file before replacing the receipt. Readers must not see half
    // a JSON document. The caller's SQL application lock serializes writes for the same token.
    await mkdir(root, { recursive: true, mode: 0o700 })
    const target = path(token)
    const temporary = target + '.tmp'
    const file = await open(temporary, 'w', 0o600)
    try {
      await file.writeFile(JSON.stringify(record))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, target)
    // Flush the directory entry as well as its contents on the Linux Docker host.
    if (process.platform !== 'win32') {
      const dir = await open(root, 'r')
      try {
        await dir.sync()
      } finally {
        await dir.close()
      }
    }
  }
  async function read(tx, token) {
    // The lock belongs to this SQL transaction and is released on commit/rollback. This also
    // makes a status request wait for an in-flight confirmation before deciding its result.
    await tx.request().input('resource', 'eg-checkout:' + token.toLowerCase()).query(`
      DECLARE @result int;
      EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000;
      IF @result<0 THROW 50001,'Checkout attempt is busy',1;`)
    let record
    try {
      record = JSON.parse(await readFile(path(token), 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
    if (record.pending) {
      const order = await tx
        .request()
        .input('order', Number(record.OrderId))
        .input('patron', Number(record.PatronId)).query(`
        SELECT o.OrderID FROM dbo.Orders o JOIN dbo.[TO] c ON c.customerID=o.customer WHERE o.OrderID=@order AND c.PatronId=@patron`)
      // A missing order means the interrupted SQL transaction rolled back. Keep its payload hash
      // so only the identical submission may retry; never return an uncommitted approval.
      if (!order.recordset.length) return { ...record, ResultJson: null }
    }
    return record
  }
  return {
    read,
    write,
    async status(database, token, user) {
      const tx = (await database.getPool()).transaction()
      await tx.begin()
      try {
        const record = await read(tx, token)
        const result =
          record && String(record.PatronId) === user.patronId && record.ResultJson
            ? JSON.parse(record.ResultJson)
            : notFound
        await tx.commit()
        return result
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
  }
}

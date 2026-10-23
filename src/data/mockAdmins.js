// Demo admin accounts that sign in without the backend. Frontend testing only: the backend does not know
// these accounts, so pages that read public tables work but saving to the database is refused.
export const mockAdmins = [
  {
    userId: 'mock-admin-1',
    username: 'admin',
    name: 'Dinh Dinh',
    email: 'admin@entertainmentguild.com',
    password: 'Admin12345',
    adminCode: 'ADMIN001',
    role: 'admin',
  },
]

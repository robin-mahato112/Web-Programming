import { createContext, useContext } from 'react'

// Zehai's customer accounts section starts here: shared session access.
export const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)
// Zehai's customer accounts section stops here.

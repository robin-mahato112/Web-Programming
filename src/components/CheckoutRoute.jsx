import { useParams } from 'react-router-dom'
import Checkout from '../pages/Checkout.jsx'
import CourseSessionGate from './CourseSessionGate.jsx'

export default function CheckoutRoute() {
  const { attemptId } = useParams()
  return (
    <CourseSessionGate>
      <Checkout key={attemptId || 'checkout'} />
    </CourseSessionGate>
  )
}

export default function Button({ children, variant = 'primary', type = 'button', ...props }) {
  const className = variant === 'secondary' ? 'button button--outline' : 'button button--dark'
  return <button className={className} type={type} {...props}>{children}</button>
}

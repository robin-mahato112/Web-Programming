export default function Button({ children, variant = 'primary', type = 'button', ...props }) {
  return <button className={`button button--${variant}`} type={type} {...props}>{children}</button>
}

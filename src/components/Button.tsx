import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

type SharedProps = {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
  children?: ReactNode
}

type LinkProps = SharedProps & {
  to: string
  target?: AnchorHTMLAttributes<HTMLAnchorElement>['target']
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>['rel']
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>['onClick']
}

type NativeButtonProps = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { to?: undefined }

type Props = LinkProps | NativeButtonProps

function isLinkProps(props: Props): props is LinkProps {
  return props.to !== undefined
}

// Shared button look for every actionable element in the app — real <button> for actions, real
// <Link> (an <a> under the hood) for navigation, so routing/right-click/a11y semantics stay
// correct while the visuals stay identical. See CLAUDE.md "Buttons, not hyperlinks".
const Button = forwardRef<HTMLButtonElement, Props>(function Button(props, ref) {
  const { variant = 'primary', size = 'md', fullWidth, className, children } = props
  const classes = [styles.button, styles[variant], styles[size], fullWidth ? styles.fullWidth : '', className]
    .filter(Boolean)
    .join(' ')

  if (isLinkProps(props)) {
    const { to, target, rel, onClick } = props
    return (
      <Link to={to} target={target} rel={rel} onClick={onClick} className={classes}>
        {children}
      </Link>
    )
  }

  const { variant: _variant, size: _size, fullWidth: _fullWidth, className: _className, to: _to, ...buttonProps } =
    props
  return (
    <button ref={ref} className={classes} {...buttonProps}>
      {children}
    </button>
  )
})

export default Button

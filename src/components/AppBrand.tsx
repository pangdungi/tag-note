import appLogoUrl from '../assets/auth-logo-doodle-book.png'

type Props = {
  className?: string
}

export function AppBrand({ className }: Props) {
  return (
    <img
      src={appLogoUrl}
      alt="두들노트"
      className={className ? `app-brand-mark ${className}` : 'app-brand-mark'}
      width={512}
      height={512}
      decoding="async"
    />
  )
}

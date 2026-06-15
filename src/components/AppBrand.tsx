import appLogoUrl from '../assets/app-logo.png'

type Props = {
  className?: string
}

export function AppBrand({ className }: Props) {
  return (
    <img
      src={appLogoUrl}
      alt="태그노트"
      className={className ? `app-brand-mark ${className}` : 'app-brand-mark'}
      width={512}
      height={512}
      decoding="async"
    />
  )
}

import logoUrl from '../../assets/brand/logo.svg';
import markUrl from '../../assets/brand/logo-mark.svg';
import { BRAND } from '../../lib/config';

export default function Logo({ variant = 'full', className, style }) {
  const src = variant === 'mark' ? markUrl : logoUrl;
  const height = variant === 'mark' ? 32 : 40;
  return (
    <img src={src} alt={BRAND.name} height={height} className={className} style={style} />
  );
}

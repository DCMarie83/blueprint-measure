import logoLightUrl from '../../assets/brand/lockup-primary.png';
import logoDarkUrl from '../../assets/brand/lockup-orange.png';
import markUrl from '../../assets/brand/mark-orange.png';
import { BRAND } from '../../lib/config';
import { useTheme } from '../../context/ThemeContext';

export default function Logo({ variant = 'full', className, style }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const fullSrc = isDark ? logoDarkUrl : logoLightUrl;
  const src = variant === 'mark' ? markUrl : fullSrc;
  const height = variant === 'mark' ? 32 : 40;
  return (
    <img src={src} alt={BRAND.name} height={height} className={className} style={style} />
  );
}

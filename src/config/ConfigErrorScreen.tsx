import { Logo } from '@/shared/ui/Logo'

export function ConfigErrorScreen({
  title = 'Falta la configuración de Supabase',
  details,
}: {
  title?: string
  details: string
}) {
  const lines = details
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="flex min-h-screen items-center justify-center bg-ice px-4 py-10">
      <div
        role="alert"
        className="w-full max-w-lg rounded-lg border border-danger/30 bg-white p-6 shadow-card"
      >
        <Logo />
        <h1 className="mt-6 text-xl font-extrabold tracking-tight text-navy">{title}</h1>
        <p className="mt-2 text-sm text-steel-800">
          La aplicación no puede iniciar porque el despliegue no tiene las variables de entorno de
          Supabase. No se inventaron credenciales.
        </p>
        <ul className="mt-4 space-y-1 rounded-md bg-danger-100 px-4 py-3 font-mono text-xs text-[#9b2c34]">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-steel-800">
          En el proyecto de Vercel de NATIUM, abre Settings → Environment Variables y define{' '}
          <span className="font-semibold">VITE_SUPABASE_URL</span> y{' '}
          <span className="font-semibold">VITE_SUPABASE_ANON_KEY</span> para Production. Usa la URL
          del proyecto y la clave pública anon. No uses la clave service_role. Después vuelve a
          desplegar.
        </p>
      </div>
    </div>
  )
}

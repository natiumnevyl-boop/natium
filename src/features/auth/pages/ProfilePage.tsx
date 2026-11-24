import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { toAppError, unwrap } from '@/lib/errors'
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader } from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { roleLabel } from '@/shared/utils/labels'

const profileSchema = z.object({
  full_name: z.string().trim().min(3, 'Ingresa tu nombre completo').max(120),
})
type ProfileInput = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '' },
  })
  const { register, handleSubmit, formState, reset } = form

  useEffect(() => {
    reset({ full_name: profile?.full_name ?? '' })
  }, [profile, reset])

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Datos de tu cuenta. El correo se gestiona con el enlace de recuperación si necesitas cambiarlo."
      />
      <Card className="max-w-xl">
        <CardHeader title="Identidad" />
        <CardBody>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={handleSubmit(async (values) => {
              try {
                unwrap(
                  await supabase
                    .from('profiles')
                    .update({ full_name: values.full_name })
                    .eq('id', user!.id),
                )
                await refreshProfile()
                toast.success('Perfil actualizado')
              } catch (err) {
                toast.error(toAppError(err).message)
              }
            })}
          >
            <Field label="Nombre completo" error={formState.errors.full_name?.message} required>
              {(p) => <Input {...p} {...register('full_name')} />}
            </Field>
            <Field label="Correo electrónico" hint="No editable desde aquí">
              {(p) => <Input {...p} value={profile?.email ?? ''} disabled readOnly />}
            </Field>
            <Field label="Rol">
              {(p) => (
                <Input
                  {...p}
                  value={profile ? roleLabel[profile.role] : ''}
                  disabled
                  readOnly
                />
              )}
            </Field>
            <div className="flex justify-end pt-2">
              <Button type="submit" loading={formState.isSubmitting}>
                Guardar cambios
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  )
}

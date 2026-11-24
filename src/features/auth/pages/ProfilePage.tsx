import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { toAppError, unwrap } from '@/lib/errors'
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { roleLabel } from '@/shared/utils/labels'
import { ImageUpload, resolveMediaUrl } from '@/shared/media'
import { useMyTeams } from '@/features/teams/api'
import { useMyOrganization } from '@/features/competitions/api'

const profileSchema = z.object({
  full_name: z.string().trim().min(3, 'Ingresa tu nombre completo').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  specialty: z.string().trim().max(120).optional().or(z.literal('')),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
})
type ProfileInput = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const teams = useMyTeams()
  const org = useMyOrganization()
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', phone: '', specialty: '', bio: '' },
  })
  const { register, handleSubmit, formState, reset } = form

  useEffect(() => {
    reset({
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
      specialty: profile?.specialty ?? '',
      bio: profile?.bio ?? '',
    })
    setAvatarPath(profile?.avatar_path ?? null)
  }, [profile, reset])

  useEffect(() => {
    let active = true
    if (!avatarPath) {
      setAvatarUrl(null)
      return
    }
    void resolveMediaUrl('profile-avatars', avatarPath).then((url) => {
      if (active) setAvatarUrl(url)
    })
    return () => {
      active = false
    }
  }, [avatarPath])

  const association =
    profile?.role === 'organizer' || profile?.role === 'platform_admin'
      ? org.data?.trade_name || org.data?.name || null
      : teams.data?.[0]?.name || null

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Información profesional de tu cuenta. Los datos de contacto permanecen privados."
      />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit">
          <CardBody className="flex flex-col items-center gap-3 pt-6">
            <Avatar
              name={profile?.full_name || profile?.email || '?'}
              src={avatarUrl}
              size="lg"
              className="size-24 text-2xl"
            />
            <div className="text-center">
              <p className="font-bold text-navy">{profile?.full_name || '—'}</p>
              <p className="text-xs text-steel-600">
                {profile ? roleLabel[profile.role] : ''}
              </p>
              {association && (
                <p className="mt-1 text-xs font-semibold text-ocean">{association}</p>
              )}
            </div>
            <ImageUpload
              kind="avatar"
              bucket="profile-avatars"
              folderId={user?.id}
              path={avatarPath}
              className="w-full"
              hint="Privada · solo tu cuenta"
              onChange={async ({ path }) => {
                setAvatarPath(path)
                try {
                  unwrap(
                    await supabase
                      .from('profiles')
                      .update({ avatar_path: path })
                      .eq('id', user!.id),
                  )
                  await refreshProfile()
                  toast.success(path ? 'Fotografía actualizada' : 'Fotografía eliminada')
                } catch (err) {
                  toast.error(toAppError(err).message)
                }
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Datos profesionales" />
          <CardBody>
            <form
              noValidate
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={handleSubmit(async (values) => {
                try {
                  unwrap(
                    await supabase
                      .from('profiles')
                      .update({
                        full_name: values.full_name,
                        phone: values.phone || null,
                        specialty: values.specialty || null,
                        bio: values.bio || null,
                        avatar_path: avatarPath,
                      })
                      .eq('id', user!.id),
                  )
                  await refreshProfile()
                  toast.success('Perfil actualizado')
                } catch (err) {
                  toast.error(toAppError(err).message)
                }
              })}
            >
              <Field
                label="Nombre completo"
                error={formState.errors.full_name?.message}
                required
                className="sm:col-span-2"
              >
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
              <Field
                label="Teléfono"
                error={formState.errors.phone?.message}
                hint="Privado · no se publica"
              >
                {(p) => <Input {...p} type="tel" {...register('phone')} />}
              </Field>
              <Field label="Especialidad" error={formState.errors.specialty?.message}>
                {(p) => (
                  <Input
                    {...p}
                    {...register('specialty')}
                    placeholder="Ej. Entrenador de velocidad"
                  />
                )}
              </Field>
              <Field
                label="Descripción profesional"
                error={formState.errors.bio?.message}
                className="sm:col-span-2"
              >
                {(p) => <Textarea {...p} rows={4} {...register('bio')} />}
              </Field>
              <div className="flex justify-end pt-2 sm:col-span-2">
                <Button type="submit" loading={formState.isSubmitting}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}

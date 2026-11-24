import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  Field,
  Input,
  PageHeader,
  Textarea,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { toAppError } from '@/lib/errors'
import { ImageUpload, publicObjectUrl } from '@/shared/media'
import {
  organizationSchema,
  useMyOrganization,
  useSaveOrganization,
  type OrganizationInput,
} from '../api'

type SocialLinks = {
  facebook?: string
  instagram?: string
  x?: string
  youtube?: string
}

export function OrganizationPage() {
  const org = useMyOrganization()
  const save = useSaveOrganization()
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const { register, handleSubmit, formState, reset, watch, setValue } = useForm<OrganizationInput>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { country: 'MX', name: '', slug: '' },
  })
  const e = formState.errors
  const values = watch()

  useEffect(() => {
    if (!org.data) return
    const social = (org.data.social_links ?? {}) as SocialLinks
    reset({
      name: org.data.name,
      trade_name: org.data.trade_name ?? '',
      slug: org.data.slug,
      description: org.data.description ?? '',
      contact_email: org.data.contact_email ?? '',
      contact_phone: org.data.contact_phone ?? '',
      website_url: org.data.website_url ?? '',
      city: org.data.city ?? '',
      state: org.data.state ?? '',
      country: org.data.country,
      social_facebook: social.facebook ?? '',
      social_instagram: social.instagram ?? '',
      social_x: social.x ?? '',
      social_youtube: social.youtube ?? '',
    })
    setLogoPath(org.data.logo_path)
    setCoverPath(org.data.cover_path)
  }, [org.data, reset])

  const name = watch('name')
  useEffect(() => {
    if (!org.data && name)
      setValue(
        'slug',
        name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40),
      )
  }, [name, org.data, setValue])

  const preview = useMemo(
    () => ({
      displayName: values.trade_name?.trim() || values.name || 'Tu organización',
      location: [values.city, values.state].filter(Boolean).join(', '),
      logoUrl: logoPath ? publicObjectUrl('org-assets', logoPath) : null,
      coverUrl: coverPath ? publicObjectUrl('org-assets', coverPath) : null,
    }),
    [values.trade_name, values.name, values.city, values.state, logoPath, coverPath],
  )

  if (org.isLoading) return <CardSkeleton lines={6} />

  return (
    <>
      <PageHeader
        title="Organización"
        description="Identidad institucional bajo la cual publicas competencias. Lo privado no se muestra en páginas públicas."
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title={org.data ? 'Datos institucionales' : 'Registrar organización'}
              description={
                org.data
                  ? `Tu rol: ${org.data.my_role}`
                  : 'Es necesario para crear competencias.'
              }
            />
            <CardBody>
              <form
                noValidate
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={handleSubmit(async (v) => {
                  try {
                    await save.mutateAsync({
                      ...v,
                      id: org.data?.id,
                      logo_path: logoPath,
                      cover_path: coverPath,
                    })
                    toast.success('Organización guardada')
                  } catch (err) {
                    toast.error(toAppError(err).message)
                  }
                })}
              >
                <Field label="Nombre oficial" error={e.name?.message} required className="sm:col-span-2">
                  {(p) => <Input {...p} {...register('name')} />}
                </Field>
                <Field
                  label="Nombre comercial"
                  error={e.trade_name?.message}
                  hint="Opcional. Se usa en materiales institucionales."
                  className="sm:col-span-2"
                >
                  {(p) => <Input {...p} {...register('trade_name')} />}
                </Field>
                <Field label="Identificador (slug)" error={e.slug?.message} required>
                  {(p) => <Input {...p} {...register('slug')} />}
                </Field>
                <Field label="Sitio web" error={e.website_url?.message}>
                  {(p) => (
                    <Input {...p} type="url" placeholder="https://…" {...register('website_url')} />
                  )}
                </Field>
                <Field
                  label="Descripción"
                  error={e.description?.message}
                  className="sm:col-span-2"
                >
                  {(p) => <Textarea {...p} rows={3} {...register('description')} />}
                </Field>
                <Field label="Correo de contacto" error={e.contact_email?.message}>
                  {(p) => <Input {...p} type="email" {...register('contact_email')} />}
                </Field>
                <Field label="Teléfono" error={e.contact_phone?.message}>
                  {(p) => <Input {...p} type="tel" {...register('contact_phone')} />}
                </Field>
                <Field label="Ciudad" error={e.city?.message}>
                  {(p) => <Input {...p} {...register('city')} />}
                </Field>
                <Field label="Estado" error={e.state?.message}>
                  {(p) => <Input {...p} {...register('state')} />}
                </Field>
                <Field label="País" error={e.country?.message}>
                  {(p) => (
                    <Input {...p} {...register('country')} maxLength={2} className="uppercase" />
                  )}
                </Field>
                <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
                  <Field label="Facebook" error={e.social_facebook?.message}>
                    {(p) => <Input {...p} type="url" {...register('social_facebook')} />}
                  </Field>
                  <Field label="Instagram" error={e.social_instagram?.message}>
                    {(p) => <Input {...p} type="url" {...register('social_instagram')} />}
                  </Field>
                  <Field label="X (Twitter)" error={e.social_x?.message}>
                    {(p) => <Input {...p} type="url" {...register('social_x')} />}
                  </Field>
                  <Field label="YouTube" error={e.social_youtube?.message}>
                    {(p) => <Input {...p} type="url" {...register('social_youtube')} />}
                  </Field>
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" loading={save.isPending || formState.isSubmitting}>
                    Guardar
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Identidad visual"
              description="Logotipo y portada institucionales. Visibles en contextos de marca, no como datos personales."
            />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <ImageUpload
                kind="logo"
                bucket="org-assets"
                folderId={org.data?.id}
                path={logoPath}
                label="Logo"
                hint="1:1 · PNG o SVG preferido"
                onChange={async ({ path }) => {
                  setLogoPath(path)
                  if (org.data?.id) {
                    try {
                      await save.mutateAsync({
                        id: org.data.id,
                        ...organizationSchema.parse({
                          ...values,
                          country: values.country || 'MX',
                        }),
                        logo_path: path,
                        cover_path: coverPath,
                      })
                      toast.success('Logo actualizado')
                    } catch (err) {
                      toast.error(toAppError(err).message)
                    }
                  }
                }}
              />
              <ImageUpload
                kind="cover"
                bucket="org-assets"
                folderId={org.data?.id}
                path={coverPath}
                label="Portada"
                hint="16:9 · uso institucional"
                onChange={async ({ path }) => {
                  setCoverPath(path)
                  if (org.data?.id) {
                    try {
                      await save.mutateAsync({
                        id: org.data.id,
                        ...organizationSchema.parse({
                          ...values,
                          country: values.country || 'MX',
                        }),
                        logo_path: logoPath,
                        cover_path: path,
                      })
                      toast.success('Portada actualizada')
                    } catch (err) {
                      toast.error(toAppError(err).message)
                    }
                  }
                }}
              />
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader title="Vista previa" description="Cómo se presenta la marca institucional." />
          <CardBody className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-ice-200 bg-ice">
              <div className="aspect-video bg-navy/90">
                {preview.coverUrl ? (
                  <img src={preview.coverUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-steel">
                    Sin portada
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 bg-white p-4">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ice-200 bg-ice">
                  {preview.logoUrl ? (
                    <img src={preview.logoUrl} alt="" className="size-full object-contain p-1" />
                  ) : (
                    <span className="text-[10px] font-bold text-steel-600">LOGO</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy">{preview.displayName}</p>
                  <p className="truncate text-xs text-steel-600">
                    {preview.location || 'Ciudad / estado'}
                  </p>
                </div>
              </div>
            </div>
            {values.description && (
              <p className="text-sm text-steel-800 line-clamp-4">{values.description}</p>
            )}
            <p className="text-xs text-steel-600">
              El correo y teléfono de contacto no se publican automáticamente en páginas abiertas.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  )
}

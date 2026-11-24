import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSkeleton,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '@/shared/ui'
import { toast } from '@/shared/ui/Toaster'
import { toAppError } from '@/lib/errors'
import { toDateTimeLocalInput } from '@/shared/utils/dates'
import { ImageUpload, publicObjectUrl } from '@/shared/media'
import {
  competitionSchema,
  useCompetition,
  useMyOrganization,
  useSaveCompetition,
  type CompetitionInput,
} from '../api'

export function CompetitionFormPage() {
  const { competitionId } = useParams()
  const navigate = useNavigate()
  const org = useMyOrganization()
  const existing = useCompetition(competitionId)
  const save = useSaveCompetition()
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const form = useForm<CompetitionInput>({
    resolver: zodResolver(competitionSchema),
    defaultValues: {
      pool_course: 'SCM',
      pool_length_m: 25,
      allow_no_time: false,
      code: '',
      name: '',
      start_date: '',
      end_date: '',
      registration_opens_at: '',
      registration_closes_at: '',
    },
  })
  const { register, handleSubmit, formState, watch, setValue, reset } = form
  const e = formState.errors
  const watched = watch()

  useEffect(() => {
    const c = existing.data
    if (!c) return
    reset({
      name: c.name,
      code: c.code,
      description: c.description ?? '',
      start_date: c.start_date,
      end_date: c.end_date,
      venue: c.venue ?? '',
      city: c.city ?? '',
      registration_opens_at: toDateTimeLocalInput(c.registration_opens_at),
      registration_closes_at: toDateTimeLocalInput(c.registration_closes_at),
      pool_course: c.pool_course,
      pool_length_m: c.pool_length_m,
      age_reference_date: c.age_reference_date ?? '',
      max_entries_per_athlete: c.max_entries_per_athlete ?? '',
      allow_no_time: c.allow_no_time,
      requirements: c.requirements ?? '',
      cover_image_url: c.cover_image_url ?? '',
    })
    setLogoPath(c.logo_path)
    setCoverPath(c.cover_path)
  }, [existing.data, reset])

  const course = watch('pool_course')
  useEffect(() => {
    if (course === 'SCM') setValue('pool_length_m', 25)
    if (course === 'LCM') setValue('pool_length_m', 50)
  }, [course, setValue])

  const coverPreview = useMemo(() => {
    if (coverPath) return publicObjectUrl('competition-assets', coverPath)
    if (watched.cover_image_url) return watched.cover_image_url
    return null
  }, [coverPath, watched.cover_image_url])

  const logoPreview = useMemo(
    () => (logoPath ? publicObjectUrl('competition-assets', logoPath) : null),
    [logoPath],
  )

  if (competitionId && existing.isLoading) return <CardSkeleton lines={10} />

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Competencias', to: '/org/competitions' },
          { label: competitionId ? 'Editar' : 'Nueva' },
        ]}
        title={competitionId ? 'Editar competencia' : 'Nueva competencia'}
        description="Define la convocatoria e identidad visual. La página pública no expone datos personales."
        actions={
          competitionId ? (
            <Link to={`/c/${competitionId}`} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                Vista pública
              </Button>
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          noValidate
          onSubmit={handleSubmit(async (values) => {
            try {
              const coverUrl =
                values.cover_image_url ||
                (coverPath ? publicObjectUrl('competition-assets', coverPath) : '')
              const c = await save.mutateAsync({
                ...values,
                cover_image_url: coverUrl,
                id: competitionId,
                organization_id: org.data!.id,
                logo_path: logoPath,
                cover_path: coverPath,
              })
              toast.success(competitionId ? 'Competencia actualizada' : 'Competencia creada')
              navigate(`/org/competitions/${c.id}`)
            } catch (err) {
              const er = toAppError(err)
              toast.error(
                er.code === 'duplicate'
                  ? 'Ya existe una competencia con ese identificador.'
                  : er.message,
              )
            }
          })}
          className="flex flex-col gap-5"
        >
          <Card>
            <CardHeader title="Identidad" />
            <CardBody className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <Field label="Nombre oficial" error={e.name?.message} required>
                {(p) => <Input {...p} {...register('name')} />}
              </Field>
              <Field
                label="Identificador"
                error={e.code?.message}
                required
                hint="Se usa en folios y exportaciones"
              >
                {(p) => (
                  <Input
                    {...p}
                    {...register('code')}
                    className="uppercase tnum"
                    placeholder="CDP27"
                  />
                )}
              </Field>
              <Field
                label="Descripción / convocatoria"
                error={e.description?.message}
                className="sm:col-span-2"
              >
                {(p) => <Textarea {...p} rows={4} {...register('description')} />}
              </Field>
              <Field
                label="Portada externa (URL)"
                error={e.cover_image_url?.message}
                hint="Opcional si subes archivo. HTTPS público."
                className="sm:col-span-2"
              >
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    placeholder="https://…"
                    {...register('cover_image_url')}
                  />
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Imágenes"
              description={
                competitionId
                  ? 'Logo y portada alojados en NATIUM (públicos institucionales).'
                  : 'Guarda la competencia primero para subir archivos; puedes usar una URL de portada desde ya.'
              }
            />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <ImageUpload
                kind="logo"
                bucket="competition-assets"
                folderId={competitionId}
                path={logoPath}
                label="Logo"
                hint="1:1"
                onChange={async ({ path, url }) => {
                  setLogoPath(path)
                  if (competitionId) {
                    try {
                      await save.mutateAsync({
                        ...watched,
                        id: competitionId,
                        organization_id: org.data!.id,
                        logo_path: path,
                        cover_path: coverPath,
                        cover_image_url:
                          watched.cover_image_url ||
                          (coverPath ? publicObjectUrl('competition-assets', coverPath) : '') ||
                          url ||
                          '',
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
                bucket="competition-assets"
                folderId={competitionId}
                path={coverPath}
                label="Portada"
                hint="16:9 · página pública"
                onChange={async ({ path, url }) => {
                  setCoverPath(path)
                  if (url) setValue('cover_image_url', url)
                  if (competitionId) {
                    try {
                      await save.mutateAsync({
                        ...watched,
                        cover_image_url: url || watched.cover_image_url || '',
                        id: competitionId,
                        organization_id: org.data!.id,
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

          <Card>
            <CardHeader title="Fechas y sede" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha de inicio" error={e.start_date?.message} required>
                {(p) => <Input {...p} type="date" {...register('start_date')} />}
              </Field>
              <Field label="Fecha de fin" error={e.end_date?.message} required>
                {(p) => <Input {...p} type="date" {...register('end_date')} />}
              </Field>
              <Field label="Sede" error={e.venue?.message}>
                {(p) => <Input {...p} {...register('venue')} />}
              </Field>
              <Field label="Ciudad" error={e.city?.message}>
                {(p) => <Input {...p} {...register('city')} />}
              </Field>
              <Field
                label="Apertura de inscripciones"
                error={e.registration_opens_at?.message}
                required
              >
                {(p) => (
                  <Input {...p} type="datetime-local" {...register('registration_opens_at')} />
                )}
              </Field>
              <Field
                label="Cierre de inscripciones"
                error={e.registration_closes_at?.message}
                required
              >
                {(p) => (
                  <Input {...p} type="datetime-local" {...register('registration_closes_at')} />
                )}
              </Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Reglas de inscripción" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo de alberca" required>
                {(p) => (
                  <Select {...p} {...register('pool_course')}>
                    <option value="SCM">Curso corto (25 m)</option>
                    <option value="LCM">Curso largo (50 m)</option>
                    <option value="OTHER">Otra</option>
                  </Select>
                )}
              </Field>
              <Field label="Longitud (m)" error={e.pool_length_m?.message} required>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    {...register('pool_length_m')}
                    disabled={course !== 'OTHER'}
                  />
                )}
              </Field>
              <Field
                label="Fecha de referencia de edad"
                error={e.age_reference_date?.message}
                hint="Vacío = fecha de inicio"
              >
                {(p) => <Input {...p} type="date" {...register('age_reference_date')} />}
              </Field>
              <Field
                label="Máximo de pruebas por atleta"
                error={e.max_entries_per_athlete?.message}
                hint="Vacío = sin límite"
              >
                {(p) => (
                  <Input {...p} type="number" min={1} {...register('max_entries_per_athlete')} />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm text-navy sm:col-span-2">
                <Checkbox {...register('allow_no_time')} /> Permitir inscripciones sin tiempo (NT)
              </label>
              <Field
                label="Requisitos / información de inscripción"
                error={e.requirements?.message}
                className="sm:col-span-2"
              >
                {(p) => <Textarea {...p} rows={3} {...register('requirements')} />}
              </Field>
            </CardBody>
          </Card>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" loading={formState.isSubmitting || save.isPending}>
              {competitionId ? 'Guardar cambios' : 'Crear competencia'}
            </Button>
          </div>
        </form>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader title="Vista previa pública" description="Apariencia aproximada de /c/…" />
          <CardBody className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-ice-200 bg-white">
              <div className="aspect-video bg-navy">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-steel">
                    Sin portada
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-start gap-3">
                  {logoPreview && (
                    <img
                      src={logoPreview}
                      alt=""
                      className="size-12 rounded-md border border-ice-200 object-contain p-1"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-navy">
                      {watched.name?.trim() || 'Nombre de la competencia'}
                    </p>
                    <p className="text-xs text-steel-600">
                      {[watched.venue, watched.city].filter(Boolean).join(' · ') || 'Sede'}
                    </p>
                  </div>
                </div>
                {watched.description && (
                  <p className="text-sm text-steel-800 line-clamp-3">{watched.description}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-steel-600">
              No se muestran atletas, correos ni fotografías privadas en la página pública.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  )
}

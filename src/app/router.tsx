import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { AuthLayout } from './layouts/AuthLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { RedirectIfAuthed, RequireAuth } from './guards/RequireAuth'
import { RequireRole } from './guards/RequireRole'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { UpdatePasswordPage } from '@/features/auth/pages/UpdatePasswordPage'
import { ProfilePage } from '@/features/auth/pages/ProfilePage'
import { HomeRedirect } from '@/features/dashboard/HomeRedirect'
import { CoachDashboardPage } from '@/features/dashboard/CoachDashboardPage'
import { OrganizerDashboardPage } from '@/features/dashboard/OrganizerDashboardPage'
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage'
import { AdminUsersPage } from '@/features/admin/AdminUsersPage'
import { AdminUserDetailPage } from '@/features/admin/AdminUserDetailPage'
import { AdminAuditPage } from '@/features/admin/AdminAuditPage'
import { AdminSystemPage } from '@/features/admin/AdminSystemPage'
import { AdminOrganizationsPage } from '@/features/admin/AdminOrganizationsPage'
import { AdminTeamsPage } from '@/features/admin/AdminTeamsPage'
import { AdminAthletesPage } from '@/features/admin/AdminAthletesPage'
import { AdminCompetitionsPage } from '@/features/admin/AdminCompetitionsPage'
import { AdminRegistrationsPage } from '@/features/admin/AdminRegistrationsPage'
import { AdminExportsPage } from '@/features/admin/AdminExportsPage'
import { TeamsPage } from '@/features/teams/pages/TeamsPage'
import { TeamDetailPage } from '@/features/teams/pages/TeamDetailPage'
import { AthletesPage } from '@/features/athletes/pages/AthletesPage'
import { AthleteDetailPage } from '@/features/athletes/pages/AthleteDetailPage'
import { OpenCompetitionsPage } from '@/features/competitions/pages/OpenCompetitionsPage'
import { CompetitionPublicPage } from '@/features/competitions/pages/CompetitionPublicPage'
import { PublicCompetitionSharePage } from '@/features/competitions/pages/PublicCompetitionSharePage'
import { OrgCompetitionsPage } from '@/features/competitions/pages/OrgCompetitionsPage'
import { CompetitionFormPage } from '@/features/competitions/pages/CompetitionFormPage'
import { OrgCompetitionDetailPage } from '@/features/competitions/pages/OrgCompetitionDetailPage'
import { OrganizationPage } from '@/features/competitions/pages/OrganizationPage'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { MyRegistrationsPage } from '@/features/registrations/pages/MyRegistrationsPage'
import { RegistrationWizardPage } from '@/features/registrations/pages/RegistrationWizardPage'
import { RegistrationDetailPage } from '@/features/registrations/pages/RegistrationDetailPage'
import { OrgRegistrationsPage } from '@/features/registrations/pages/OrgRegistrationsPage'
import { NotFoundPage } from '@/shared/ui/StatusPages'

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [{ path: '/c/:competitionId', element: <PublicCompetitionSharePage /> }],
  },
  {
    element: <RedirectIfAuthed />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [{ path: '/update-password', element: <UpdatePasswordPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomeRedirect /> },
          { path: '/account', element: <ProfilePage /> },
          // Coach
          {
            element: <RequireRole roles={['coach', 'platform_admin']} />,
            children: [
              { path: '/dashboard', element: <CoachDashboardPage /> },
              { path: '/teams', element: <TeamsPage /> },
              { path: '/teams/:teamId', element: <TeamDetailPage /> },
              { path: '/athletes', element: <AthletesPage /> },
              { path: '/athletes/:athleteId', element: <AthleteDetailPage /> },
              { path: '/competitions', element: <OpenCompetitionsPage /> },
              { path: '/competitions/:competitionId', element: <CompetitionPublicPage /> },
              { path: '/registrations', element: <MyRegistrationsPage /> },
              {
                path: '/registrations/:registrationId/wizard',
                element: <RegistrationWizardPage />,
              },
            ],
          },
          { path: '/registrations/:registrationId', element: <RegistrationDetailPage /> },
          // Organizer
          {
            element: <RequireRole roles={['organizer', 'platform_admin']} />,
            children: [
              { path: '/org', element: <OrganizerDashboardPage /> },
              { path: '/org/organization', element: <OrganizationPage /> },
              { path: '/org/competitions', element: <OrgCompetitionsPage /> },
              { path: '/org/competitions/new', element: <CompetitionFormPage /> },
              { path: '/org/competitions/:competitionId', element: <OrgCompetitionDetailPage /> },
              { path: '/org/competitions/:competitionId/edit', element: <CompetitionFormPage /> },
              { path: '/org/registrations', element: <OrgRegistrationsPage /> },
              { path: '/org/catalog', element: <CatalogPage /> },
            ],
          },
          // Platform admin
          {
            element: <RequireRole roles={['platform_admin']} />,
            children: [
              { path: '/admin', element: <AdminDashboardPage /> },
              { path: '/admin/users', element: <AdminUsersPage /> },
              { path: '/admin/users/:userId', element: <AdminUserDetailPage /> },
              { path: '/admin/organizations', element: <AdminOrganizationsPage /> },
              { path: '/admin/teams', element: <AdminTeamsPage /> },
              { path: '/admin/athletes', element: <AdminAthletesPage /> },
              { path: '/admin/competitions', element: <AdminCompetitionsPage /> },
              { path: '/admin/registrations', element: <AdminRegistrationsPage /> },
              { path: '/admin/exports', element: <AdminExportsPage /> },
              { path: '/admin/audit', element: <AdminAuditPage /> },
              { path: '/admin/system', element: <AdminSystemPage /> },
            ],
          },
          { path: '/home', element: <Navigate to="/" replace /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

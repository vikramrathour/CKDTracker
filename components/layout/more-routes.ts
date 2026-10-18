import {
  TrendingUp,
  FlaskConical,
  Pill,
  Target,
  HeartPulse,
  FolderOpen,
  HelpCircle,
  History,
  Users,
  Stethoscope,
  UserRound,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface MoreRoute {
  href: string
  label: string
  description: string
  icon: LucideIcon
  group: 'Health' | 'Visits & files' | 'People & account'
}

/** Secondary destinations reached from the "More" tab. */
export const MORE_ROUTES: MoreRoute[] = [
  { href: '/trends', label: 'Trends', description: 'Key markers over time', icon: TrendingUp, group: 'Health' },
  { href: '/analysis', label: 'Analysis', description: 'CKD stage, volatility, interactions', icon: FlaskConical, group: 'Health' },
  { href: '/medications', label: 'Medications', description: 'Doses and dose history', icon: Pill, group: 'Health' },
  { href: '/targets', label: 'Targets', description: 'Ranges set by your doctor', icon: Target, group: 'Health' },
  { href: '/vitals', label: 'Vitals', description: 'BP, weight, temperature', icon: HeartPulse, group: 'Health' },
  { href: '/compare', label: 'Doctor view', description: 'Latest results to show at a visit', icon: Stethoscope, group: 'Visits & files' },
  { href: '/documents', label: 'Documents', description: 'Reports, prescriptions, photos', icon: FolderOpen, group: 'Visits & files' },
  { href: '/questions', label: 'Questions', description: 'For your next appointment', icon: HelpCircle, group: 'Visits & files' },
  { href: '/timeline', label: 'Timeline', description: 'Everything, in order', icon: History, group: 'Visits & files' },
  { href: '/patient', label: 'Patient profile', description: 'Name, dates, doctor, next lab test', icon: UserRound, group: 'People & account' },
  { href: '/care-circle', label: 'Care circle', description: 'Family, caregivers and doctors', icon: Users, group: 'People & account' },
  { href: '/settings', label: 'Settings', description: 'Sign-in, notifications, your data', icon: Settings, group: 'People & account' },
]

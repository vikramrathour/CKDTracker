import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalList, LegalPage, LegalSection, SUPPORT_EMAIL } from '@/components/settings/legal-page'

export const metadata: Metadata = {
  title: 'Terms of use · CKD Tracker',
  description: 'The terms for using CKD Tracker.',
}

export default function TermsPage() {
  return (
    <LegalPage eyebrow="CKD Tracker" title="Terms of use">
      <p>
        By using CKD Tracker you agree to these terms. If you don’t agree, please don’t use the app. How we handle
        your data is described in the{' '}
        <Link href="/privacy" className="tlink">
          privacy policy
        </Link>
        .
      </p>

      <LegalSection title="Not medical advice">
        <p>
          CKD Tracker organises and charts your results. It does not diagnose, treat or replace your doctor. Alerts,
          scores, trends and AI chat answers are informational and can be wrong. Always talk to your doctor before
          changing medicines or treatment.{' '}
          <strong className="text-ink">In an emergency, call your doctor or emergency services (112 in India).</strong>
        </p>
      </LegalSection>

      <LegalSection title="Check what the app reads">
        <p>
          Lab values read from reports, by pattern matching or by AI, may contain mistakes. Compare them with the
          original report and correct them before relying on them.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibilities">
        <LegalList
          items={[
            'Keep your phone and sign-in secure; you are responsible for activity on your account.',
            'Only add another person’s health information with their permission, or as their parent or guardian.',
            'Invite only people you trust to a care circle, and remove them when they no longer need access.',
            'Don’t misuse the service: no attempts to access other people’s data, overload it or get around its security.',
          ]}
        />
      </LegalSection>

      <LegalSection title="The service">
        <p>
          The app is provided “as is”. We work to keep it available and your data safe, but can’t guarantee
          uninterrupted service or that reminders will always arrive on time. Don’t rely on CKD Tracker as your only
          reminder for medicines or appointments. Keep your own copies of important reports; you can export your data
          from Settings at any time.
        </p>
        <p>
          To the extent the law allows, we aren’t liable for indirect or consequential loss arising from use of the
          app, including decisions made based on its content.
        </p>
      </LegalSection>

      <LegalSection title="Ending your use">
        <p>
          You can stop using the app and delete your account at any time from Settings. We may suspend accounts that
          misuse the service.
        </p>
      </LegalSection>

      <LegalSection title="Changes, law and contact">
        <p>
          We may update these terms and will post the new version here. These terms are governed by the laws of
          India. Questions:{' '}
          <a className="tlink" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}

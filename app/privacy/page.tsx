import type { Metadata } from 'next'
import { LegalList, LegalPage, LegalSection, SUPPORT_EMAIL } from '@/components/settings/legal-page'

export const metadata: Metadata = {
  title: 'Privacy policy · CKD Tracker',
  description: 'What CKD Tracker stores, where, who can see it and how to delete it.',
}

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="CKD Tracker" title="Privacy policy">
      <p>
        CKD Tracker helps kidney and transplant patients and their families keep lab results, medicines and doctor
        visits in one place. This policy explains what we store, where it lives, who can see it and how to delete
        it. We don’t sell your data, show ads or use third-party analytics or advertising trackers.
      </p>

      <LegalSection title="What we store">
        <LegalList
          items={[
            <>
              <strong className="text-ink">Account:</strong> your phone number and/or Google account email, and your
              name.
            </>,
            <>
              <strong className="text-ink">Patient profiles:</strong> name, date of birth, transplant date, doctor and
              hospital, as entered by you.
            </>,
            <>
              <strong className="text-ink">Health records:</strong> lab values and reports, uploaded documents (PDFs and
              photos), medications and dose history, vitals, doctor visits and questions, target ranges and alert
              rules.
            </>,
            <>
              <strong className="text-ink">AI chat:</strong> the questions you ask about your reports and the answers.
            </>,
            <>
              <strong className="text-ink">Care circle:</strong> who belongs to each profile, their role, and an
              activity log of changes (who added what, without lab values).
            </>,
            <>
              <strong className="text-ink">Devices:</strong> push-notification tokens with a coarse device label (for
              example “Chrome on Android”), your notification preferences, and daily chat usage counts.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Where it is stored">
        <p>
          Data is stored in Google Firebase (Authentication, Cloud Firestore, Cloud Storage and Cloud Messaging) on
          Google Cloud, and the app is served from Vercel. Data is encrypted in transit and at rest. Security rules
          make sure only you and the people you invite can read a profile.
        </p>
        <p>
          The app also keeps an offline copy of the data you’ve viewed on your device so it works without signal.
          Signing out clears it.
        </p>
      </LegalSection>

      <LegalSection title="AI processing">
        <p>
          When you upload a report, its text (or image) is sent to Google’s Gemini API to read the lab values. When
          you use chat, your question and a summary of the profile’s records are sent to Gemini to write the answer.
          We use Gemini on a paid Google Cloud project: under Google’s terms for paid services, prompts and responses
          are not used to train Google’s models. Google may keep them for a limited time to detect abuse. Nothing is
          sent to Gemini unless you upload a report or use chat.
        </p>
      </LegalSection>

      <LegalSection title="Who can see your data">
        <LegalList
          items={[
            'You, and the care-circle members the profile owner invites. Owners and editors can add and change data; viewers can only read it.',
            'Each person’s AI chat conversations are visible only to that person.',
            'Our service providers (Google, Vercel) process data only to run the service.',
            'We disclose data only if the law requires it.',
          ]}
        />
        <p>
          If you add someone else’s health information, such as a family member’s, make sure you have their
          permission (or are their guardian).
        </p>
      </LegalSection>

      <LegalSection title="Notifications">
        <p>
          Push notifications are optional and can be turned off per device and per type in Settings. Their text never
          includes lab values, test names or medicine names, so nothing sensitive shows on a lock screen.
        </p>
      </LegalSection>

      <LegalSection title="Keeping and deleting data">
        <p>
          We keep your data until you delete it. You can delete individual records at any time, download everything
          from Settings → Your data, and delete your account from Settings → Delete my account. That immediately
          removes your sign-in, your profile and every patient profile you own alone, with all its reports, documents
          and chats, and removes you from care circles you’ve joined. Any backups expire within 30 days.
        </p>
        <p>
          You can also ask us to delete your account by emailing{' '}
          <a className="tlink" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{' '}
          from the email address or phone number linked to it.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under India’s Digital Personal Data Protection Act, 2023 and similar laws you can access, correct and erase
          your data, withdraw consent and raise a grievance. You can do most of this in the app; for anything else,
          contact us below. We reply within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We’ll post changes on this page and update the date above; significant changes will be shown in the app.
          Questions or grievances:{' '}
          <a className="tlink" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}

import { useEffect, useRef, useState } from 'react'
import { FiSettings } from 'react-icons/fi'
import { industries } from '../../data/industries'
import { addRecruiterVacancy } from '../../data/recruiterVacancies'
import './StaffAccessModal.css'

const authorizedStaff = [
  { staffId: '12345', email: 'recruiter@imforce.co.za' },
]

const employmentTypes = ['Permanent', 'Contract', 'Fixed-term', 'Temporary']

type StaffMember = {
  staffId: string
  email: string
}

function StaffAccessModal() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null)
  const [loginError, setLoginError] = useState('')
  const [postError, setPostError] = useState('')
  const [snackbarMessage, setSnackbarMessage] = useState('')

  useEffect(() => {
    if (!snackbarMessage) return
    const timer = window.setTimeout(() => setSnackbarMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [snackbarMessage])

  const resetAccess = () => {
    setStaffMember(null)
    setLoginError('')
    setPostError('')
    setSnackbarMessage('')
  }

  const closeModal = () => {
    dialogRef.current?.close()
    resetAccess()
  }

  return (
    <>
      <button
        className="staff-access-trigger"
        type="button"
        aria-label="Open staff access"
        title="Staff access"
        onClick={() => {
          resetAccess()
          dialogRef.current?.showModal()
        }}
      >
        <FiSettings aria-hidden="true" />
      </button>

      <dialog
        className="staff-access-dialog"
        ref={dialogRef}
        aria-labelledby="staff-access-title"
        onClose={resetAccess}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeModal()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeModal()
          }
        }}
      >
        <section className="staff-access-panel">
          <button
            className="staff-access-close"
            type="button"
            aria-label="Close staff access"
            onClick={closeModal}
          >
            <span aria-hidden="true">&times;</span>
          </button>

          {!staffMember ? (
            <form
              className="staff-access-form"
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                const staffId = String(formData.get('staffId') ?? '').trim()
                const email = String(formData.get('email') ?? '')
                  .trim()
                  .toLowerCase()
                const authorized = authorizedStaff.find(
                  (staff) =>
                    staff.staffId.toLowerCase() === staffId.toLowerCase() &&
                    staff.email.toLowerCase() === email,
                )

                if (!authorized) {
                  setLoginError(
                    'Those details do not match an authorized staff account.',
                  )
                  return
                }

                setLoginError('')
                setStaffMember(authorized)
              }}
            >
              <p className="staff-access-eyebrow">IMFORCE team</p>
              <h2 id="staff-access-title">Staff access</h2>
              <p className="staff-access-description">
                Enter your staff ID and company email to create a vacancy for
                an active client.
              </p>
              <label>
                Staff ID
                <input
                  name="staffId"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{1,5}"
                  maxLength={5}
                  title="Enter up to 5 digits."
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Company email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              {loginError && (
                <p className="staff-access-error" role="alert">
                  {loginError}
                </p>
              )}
              <button className="staff-access-submit" type="submit">
                Continue
              </button>
            </form>
          ) : (
            <form
              className="staff-access-form staff-access-form--post"
              onSubmit={(event) => {
                event.preventDefault()
                setPostError('')
                setSnackbarMessage('')
                const form = event.currentTarget
                const formData = new FormData(form)
                const applicationUrl = String(
                  formData.get('applicationUrl') ?? '',
                ).trim()
                let secureApplicationUrl: string

                try {
                  const parsedUrl = new URL(applicationUrl)
                  if (parsedUrl.protocol !== 'https:') {
                    throw new Error('Application links must use HTTPS.')
                  }
                  secureApplicationUrl = parsedUrl.href
                } catch {
                  setPostError('Enter a valid HTTPS Nexora AI application link.')
                  return
                }

                const responsibilities = String(
                  formData.get('responsibilities') ?? '',
                )
                  .split('\n')
                  .map((item) => item.trim())
                  .filter(Boolean)
                const industry = industries.find(
                  (option) => option.name === formData.get('industry'),
                )
                const salary = String(formData.get('salary') ?? '').trim()

                if (!industry) {
                  setPostError('Select a valid industry.')
                  return
                }
                if (!salary) {
                  setPostError('Enter a salary or select Market Related Salary.')
                  return
                }

                try {
                  addRecruiterVacancy({
                    clientName: String(formData.get('clientName') ?? '').trim(),
                    title: String(formData.get('title') ?? '').trim(),
                    location: String(formData.get('location') ?? '').trim(),
                    region: String(formData.get('region') ?? '').trim(),
                    industry: industry.name,
                    category: String(formData.get('category') ?? '').trim(),
                    employmentType: String(
                      formData.get('employmentType') ?? '',
                    ),
                    salary,
                    applicationUrl: secureApplicationUrl,
                    summary: String(formData.get('summary') ?? '').trim(),
                    responsibilities,
                  })
                  form.reset()
                  setSnackbarMessage(
                    'Vacancy published. It is now visible in the homepage and Careers listings.',
                  )
                } catch (error) {
                  setPostError(
                    error instanceof Error
                      ? error.message
                      : 'Unable to publish this vacancy.',
                  )
                }
              }}
            >
              <div className="staff-access-form-heading">
                <div>
                  <p className="staff-access-eyebrow">Recruiter workspace</p>
                  <h2 id="staff-access-title">Add a job post</h2>
                </div>
                <button
                  className="staff-access-signout"
                  type="button"
                  onClick={() => setStaffMember(null)}
                >
                  Sign out
                </button>
              </div>
              <p className="staff-access-description">
                Signed in as {staffMember.email}. This post publishes directly
                without entering employer approval.
              </p>
              <div className="staff-access-fields">
                <label>
                  Client company
                  <input name="clientName" required />
                </label>
                <label>
                  Job title
                  <input name="title" required />
                </label>
                <label>
                  Location
                  <input name="location" required />
                </label>
                <label>
                  Province / region
                  <input name="region" required />
                </label>
                <label>
                  Industry
                  <select name="industry" defaultValue="" required>
                    <option value="" disabled>
                      Select an industry
                    </option>
                    {industries.map((industry) => (
                      <option key={industry.slug} value={industry.name}>
                        {industry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Job category
                  <input name="category" required />
                </label>
                <label>
                  Employment type
                  <select name="employmentType" defaultValue="" required>
                    <option value="" disabled>
                      Select employment type
                    </option>
                    {employmentTypes.map((employmentType) => (
                      <option key={employmentType} value={employmentType}>
                        {employmentType}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Salary
                  <select
                    name="salaryType"
                    defaultValue="specified"
                    onChange={(event) => {
                      const salaryField =
                        event.currentTarget.form?.elements.namedItem('salary')
                      if (!(salaryField instanceof HTMLInputElement)) return
                      salaryField.value =
                        event.currentTarget.value === 'market'
                          ? 'Market Related Salary'
                          : ''
                    }}
                  >
                    <option value="specified">Enter salary / range</option>
                    <option value="market">Market Related Salary</option>
                  </select>
                </label>
                <label>
                  Salary or salary range
                  <input
                    name="salary"
                    placeholder="For example, R20,000 to R25,000 per month"
                    required
                  />
                </label>
                <label className="staff-access-fields__wide">
                  Nexora AI application URL
                  <input
                    name="applicationUrl"
                    type="url"
                    placeholder="https://..."
                    required
                  />
                </label>
                <label className="staff-access-fields__wide">
                  Role summary
                  <textarea name="summary" rows={3} required />
                </label>
                <label className="staff-access-fields__wide">
                  Key responsibilities (one per line)
                  <textarea name="responsibilities" rows={4} required />
                </label>
              </div>
              <label className="staff-access-paid-check">
                <input name="paidClient" type="checkbox" required />
                <span>
                  I confirm this client has paid and is ready for candidate
                  sourcing.
                </span>
              </label>
              {postError && (
                <p className="staff-access-error" role="alert">
                  {postError}
                </p>
              )}
              <button className="staff-access-submit" type="submit">
                Publish vacancy
              </button>
              <p className="staff-access-demo">
                Prototype only: vacancies are saved in this browser and are
                visible to anyone using it.
              </p>
            </form>
          )}
        </section>
        {snackbarMessage && (
          <div className="staff-access-snackbar" role="status" aria-live="polite">
            {snackbarMessage}
          </div>
        )}
      </dialog>
    </>
  )
}

export default StaffAccessModal

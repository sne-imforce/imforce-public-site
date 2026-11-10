import { useEffect, useMemo, useState } from 'react'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import './Fee Calculator.css'

const ACTIVATION_FEE = 499
const PLACEMENT_FEE_RATE = 0.1
const INSTALMENT_COUNT = 12

const zarFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type PositionInput = {
  id: number
  title: string
  monthlySalary: string
  numberOfHires: string
}

type PositionEstimate = {
  id: number
  title: string
  numberOfHires: number
  annualCtcPerHire: number
  placementFeePerHire: number
  totalPlacementFee: number
  instalmentPerHire: number
  totalInstalment: number
  activationCreditApplied: number
  firstInvoiceAfterCredit: number
}

type Estimate = {
  positions: PositionEstimate[]
  totalAnnualCtc: number
  totalPlacementFee: number
  totalInstalment: number
  totalActivationFee: number
  totalActivationCreditApplied: number
  firstInvoiceAfterCredit: number
}

function formatCurrency(value: number) {
  return zarFormatter.format(value)
}

function isPositionReady(position: PositionInput) {
  const salary = Number(position.monthlySalary)
  const hires = Number(position.numberOfHires)
  return (
    Boolean(position.title.trim()) &&
    Number.isFinite(salary) &&
    salary > 0 &&
    Number.isSafeInteger(hires) &&
    hires > 0
  )
}

function DiscussEstimateButton({ position }: { position: PositionInput }) {
  const ready = isPositionReady(position)

  if (!ready) {
    return (
      <span
        className="fee-calculator-button fee-calculator-start-order is-disabled"
        aria-disabled="true"
      >
        Complete the estimate to discuss it
      </span>
    )
  }

  const jobOrderQuery = new URLSearchParams({
    jobTitle: position.title,
    monthlySalary: position.monthlySalary,
    numberOfHires: position.numberOfHires,
  })

  return (
    <Link
      className="fee-calculator-button fee-calculator-start-order"
      to={`/employers?${jobOrderQuery.toString()}#job-order`}
    >
      Start a job order
    </Link>
  )
}

function FeeCalculator() {
  const [positions, setPositions] = useState<PositionInput[]>([
    { id: 1, title: '', monthlySalary: '', numberOfHires: '1' },
  ])
  const nextPositionId = useState(2)

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'Fee Calculator | IMFORCE Talent Recruitment'
    if (description) {
      description.content =
        'Estimate IMFORCE permanent placement fees using monthly salary and number of hires.'
    }

    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) {
        description.content = previousDescription
      }
    }
  }, [])

  const estimate = useMemo<Estimate | null>(() => {
    const positionEstimates: PositionEstimate[] = []

    for (const position of positions) {
      const salary = Number(position.monthlySalary)
      const hires = Number(position.numberOfHires)
      if (
        !position.title.trim() ||
        !Number.isFinite(salary) ||
        salary <= 0 ||
        !Number.isSafeInteger(hires) ||
        hires <= 0
      ) {
        return null
      }

      const annualCtcPerHire = salary * INSTALMENT_COUNT
      const placementFeePerHire = annualCtcPerHire * PLACEMENT_FEE_RATE
      const totalPlacementFee = placementFeePerHire * hires
      const instalmentPerHire = placementFeePerHire / INSTALMENT_COUNT
      const totalInstalment = totalPlacementFee / INSTALMENT_COUNT
      const activationCreditApplied = Math.min(ACTIVATION_FEE, totalInstalment)
      const firstInvoiceAfterCredit = totalInstalment - activationCreditApplied
      const values = [
        annualCtcPerHire,
        placementFeePerHire,
        totalPlacementFee,
        instalmentPerHire,
        totalInstalment,
        activationCreditApplied,
        firstInvoiceAfterCredit,
      ]

      if (!values.every(Number.isFinite)) return null

      positionEstimates.push({
        id: position.id,
        title: position.title.trim(),
        numberOfHires: hires,
        annualCtcPerHire,
        placementFeePerHire,
        totalPlacementFee,
        instalmentPerHire,
        totalInstalment,
        activationCreditApplied,
        firstInvoiceAfterCredit,
      })
    }

    const totalAnnualCtc = positionEstimates.reduce(
      (total, position) => total + position.annualCtcPerHire * position.numberOfHires,
      0,
    )
    const totalPlacementFee = positionEstimates.reduce(
      (total, position) => total + position.totalPlacementFee,
      0,
    )
    const totalInstalment = positionEstimates.reduce(
      (total, position) => total + position.totalInstalment,
      0,
    )
    const totalActivationCreditApplied = positionEstimates.reduce(
      (total, position) => total + position.activationCreditApplied,
      0,
    )
    const totalActivationFee = ACTIVATION_FEE * positionEstimates.length
    const firstInvoiceAfterCredit = positionEstimates.reduce(
      (total, position) => total + position.firstInvoiceAfterCredit,
      0,
    )
    const totals = [
      totalAnnualCtc,
      totalPlacementFee,
      totalInstalment,
      totalActivationFee,
      totalActivationCreditApplied,
      firstInvoiceAfterCredit,
    ]

    if (!totals.every(Number.isFinite)) return null

    return {
      positions: positionEstimates,
      totalAnnualCtc,
      totalPlacementFee,
      totalInstalment,
      totalActivationFee,
      totalActivationCreditApplied,
      firstInvoiceAfterCredit,
    }
  }, [positions])

  const isEstimateOutOfRange = positions.every((position) => {
    const salary = Number(position.monthlySalary)
    const hires = Number(position.numberOfHires)
    return (
      Boolean(position.title.trim()) &&
      Number.isFinite(salary) &&
      salary > 0 &&
      Number.isSafeInteger(hires) &&
      hires > 0
    )
  }) && estimate === null

  const addPosition = () => {
    const id = nextPositionId[0]
    nextPositionId[1](id + 1)
    setPositions((current) => [
      ...current,
      {
        id,
        title: '',
        monthlySalary: '',
        numberOfHires: '1',
      },
    ])
  }

  const updatePosition = (
    id: number,
    field: 'title' | 'monthlySalary' | 'numberOfHires',
    value: string,
  ) => {
    setPositions((current) =>
      current.map((position) =>
        position.id === id ? { ...position, [field]: value } : position,
      ),
    )
  }

  const removePosition = (id: number) => {
    setPositions((current) =>
      current.length > 1
        ? current.filter((position) => position.id !== id)
        : current,
    )
  }

  return (
    <>
      <Navbar />
      <main className="fee-calculator-page">
        <section className="fee-calculator-hero" aria-labelledby="fee-page-title">
          <div className="fee-calculator-shell fee-calculator-hero__inner">
            <p className="fee-calculator-eyebrow">IMFORCE Fee Calculator</p>
            <h1 id="fee-page-title">
              Plan your next hire with a clearer estimate.
            </h1>
            <p>
              Estimate permanent placement fees using the monthly salary and
              number of people you plan to hire.
            </p>
          </div>
        </section>

        <section
          className="fee-calculator-shell fee-calculator-content"
          aria-labelledby="fee-calculator-title"
        >
          <div className="fee-calculator-card">
            <div className="fee-calculator-card__heading">
              <p className="fee-calculator-eyebrow fee-calculator-eyebrow--blue">
                Placement estimate
              </p>
              <h2 id="fee-calculator-title">Add your open positions</h2>
              <p>
                Add each position with its expected monthly salary and number
                of hires. Estimates are calculated separately for each role.
              </p>
            </div>

            <div className="fee-calculator-positions">
              {positions.map((position, index) => {
                const salaryIsInvalid =
                  position.monthlySalary !== '' &&
                  (!Number.isFinite(Number(position.monthlySalary)) ||
                    Number(position.monthlySalary) <= 0)
                const hiresIsInvalid =
                  position.numberOfHires !== '' &&
                  (!Number.isSafeInteger(Number(position.numberOfHires)) ||
                    Number(position.numberOfHires) <= 0)

                return (
                  <fieldset
                    className="fee-calculator-position"
                    key={position.id}
                  >
                    <legend>Position {index + 1}</legend>
                    <div className="fee-calculator-position__fields">
                      <div className="fee-calculator-field fee-calculator-field--title">
                        <label htmlFor={`position-title-${position.id}`}>
                          Position title
                        </label>
                        <input
                          className="fee-calculator-field__number"
                          id={`position-title-${position.id}`}
                          value={position.title}
                          placeholder={`Position ${index + 1}`}
                          onChange={(event) =>
                            updatePosition(position.id, 'title', event.target.value)
                          }
                        />
                      </div>
                      <div className="fee-calculator-field">
                        <label htmlFor={`position-salary-${position.id}`}>
                          Monthly salary per hire
                        </label>
                        <div className="fee-calculator-input">
                          <span aria-hidden="true">R</span>
                          <input
                            id={`position-salary-${position.id}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="e.g. 25 000"
                            value={position.monthlySalary}
                            aria-invalid={salaryIsInvalid}
                            onChange={(event) =>
                              updatePosition(
                                position.id,
                                'monthlySalary',
                                event.target.value,
                              )
                            }
                          />
                        </div>
                        {salaryIsInvalid && (
                          <p className="fee-calculator-field__error">
                            Enter a salary greater than zero.
                          </p>
                        )}
                      </div>
                      <div className="fee-calculator-field">
                        <label htmlFor={`position-hires-${position.id}`}>
                          Number of hires
                        </label>
                        <input
                          className="fee-calculator-field__number"
                          id={`position-hires-${position.id}`}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={position.numberOfHires}
                          aria-invalid={hiresIsInvalid}
                          onChange={(event) =>
                            updatePosition(
                              position.id,
                              'numberOfHires',
                              event.target.value,
                            )
                          }
                        />
                        {hiresIsInvalid && (
                          <p className="fee-calculator-field__error">
                            Enter a whole number of one or more hires.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="fee-calculator-position__actions">
                      <DiscussEstimateButton position={position} />
                      {positions.length > 1 && (
                        <button
                          className="fee-calculator-remove-position"
                          type="button"
                          aria-label={`Remove ${position.title || `position ${index + 1}`}`}
                          onClick={() => removePosition(position.id)}
                        >
                          <FiTrash2 aria-hidden="true" />
                          Remove position
                        </button>
                      )}
                    </div>
                    {!isPositionReady(position) && (
                      <p className="fee-calculator-start-order__hint">
                        Add the position title, salary and number of hires to
                        start a job order.
                      </p>
                    )}
                  </fieldset>
                )
              })}
            </div>
            <button
              className="fee-calculator-add-position"
              type="button"
              onClick={addPosition}
            >
              <FiPlus aria-hidden="true" />
              Add position
            </button>

            <div
              className="fee-calculator-results"
              aria-live="polite"
              aria-atomic="true"
            >
              {estimate ? (
                <>
                  <div className="fee-calculator-results__heading">
                    <div>
                      <p className="fee-calculator-eyebrow fee-calculator-eyebrow--blue">
                        Your estimate
                      </p>
                      <h3>Estimate across all positions</h3>
                    </div>
                    <span className="fee-calculator-results__rate">
                      {positions.length} {positions.length === 1 ? 'position' : 'positions'}
                    </span>
                  </div>

                  <div className="fee-calculator-position-results">
                    {estimate.positions.map((position) => {
                      const input = positions.find(
                        (current) => current.id === position.id,
                      )

                      return (
                        <article
                          className="fee-calculator-position-result"
                          key={position.id}
                        >
                          <div className="fee-calculator-position-result__heading">
                            <h4>{position.title}</h4>
                            <span>
                              {position.numberOfHires}{' '}
                              {position.numberOfHires === 1 ? 'hire' : 'hires'}
                            </span>
                          </div>
                          <dl>
                            <div>
                              <dt>Annual CTC per hire</dt>
                              <dd>{formatCurrency(position.annualCtcPerHire)}</dd>
                            </div>
                            <div>
                              <dt>Placement fee per hire</dt>
                              <dd>{formatCurrency(position.placementFeePerHire)}</dd>
                            </div>
                            <div>
                              <dt>Total placement fee</dt>
                              <dd>{formatCurrency(position.totalPlacementFee)}</dd>
                            </div>
                            <div>
                              <dt>Monthly instalment for this position</dt>
                              <dd>{formatCurrency(position.totalInstalment)}</dd>
                            </div>
                            <div>
                              <dt>Activation fee for this position</dt>
                              <dd>{formatCurrency(ACTIVATION_FEE)}</dd>
                            </div>
                            <div>
                              <dt>Activation credit on first invoice</dt>
                              <dd>−{formatCurrency(position.activationCreditApplied)}</dd>
                            </div>
                            <div className="fee-calculator-position-result__first-invoice">
                              <dt>First invoice after credit</dt>
                              <dd>{formatCurrency(position.firstInvoiceAfterCredit)}</dd>
                            </div>
                          </dl>
                          {input && <DiscussEstimateButton position={input} />}
                        </article>
                      )
                    })}
                  </div>

                  <dl className="fee-calculator-breakdown">
                    <div>
                      <dt>Combined annual CTC across all hires</dt>
                      <dd>{formatCurrency(estimate.totalAnnualCtc)}</dd>
                    </div>
                    <div className="fee-calculator-breakdown__emphasis">
                      <dt>
                        Combined placement fee
                        <span>Across all positions and successful hires</span>
                      </dt>
                      <dd>{formatCurrency(estimate.totalPlacementFee)}</dd>
                    </div>
                    <div>
                      <dt>Combined monthly instalments</dt>
                      <dd>{formatCurrency(estimate.totalInstalment)}</dd>
                    </div>
                    <div>
                      <dt>Total activation fees</dt>
                      <dd>{formatCurrency(estimate.totalActivationFee)}</dd>
                    </div>
                    <div>
                      <dt>Total activation credits applied</dt>
                      <dd>−{formatCurrency(estimate.totalActivationCreditApplied)}</dd>
                    </div>
                    <div className="fee-calculator-breakdown__total">
                      <dt>Combined first invoices after credits</dt>
                      <dd>{formatCurrency(estimate.firstInvoiceAfterCredit)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="fee-calculator-empty">
                  <p className="fee-calculator-eyebrow fee-calculator-eyebrow--blue">
                    Estimate preview
                  </p>
                  <h3>Complete each position to see your estimate.</h3>
                  <p>
                    Add a monthly salary and hire count for every position.
                    Your breakdown will show separate estimates and combined
                    totals.
                  </p>
                  {isEstimateOutOfRange && (
                    <p className="fee-calculator-field__error" role="alert">
                      These values are too large to calculate. Enter a lower
                      salary or number of hires.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="fee-calculator-disclaimer">
              <h3>About this estimate</h3>
              <ul>
                <li>
                  Estimates are based on monthly salary × 12 and a 10%
                  placement fee per successful hire.
                </li>
                <li>
                  The R499 activation fee applies once per position/job order,
                  regardless of the number of hires for that position. It is
                  credited against that position’s first placement invoice.
                </li>
                <li>
                  VAT treatment has not been configured and must be confirmed
                  with IMFORCE Finance.
                </li>
                <li>
                  Each position’s fee is calculated separately using the
                  successful hires’ agreed CTC. All figures are estimates
                  subject to the signed agreement and final agreed salary/CTC.
                </li>
              </ul>
            </div>
          </div>

          <aside className="fee-calculator-contact">
            <div>
              <p className="fee-calculator-eyebrow fee-calculator-eyebrow--blue">
                Need a hand?
              </p>
              <h2>Let’s talk about your hiring needs.</h2>
              <p>
                Our team can help clarify your estimate and the placement
                process.
              </p>
            </div>
            <Link className="fee-calculator-button" to="/contact">
              Contact IMFORCE
            </Link>
          </aside>
        </section>
      </main>
    </>
  )
}

export default FeeCalculator
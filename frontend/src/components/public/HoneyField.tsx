import './HoneyField.css'

export function HoneyField() {
  return (
    <div className="honeyfield" aria-hidden="true">
      <label>
        Company website
        <input
          name="hp_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </label>
    </div>
  )
}

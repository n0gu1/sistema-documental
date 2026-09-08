export default function DocumentMetadataFields({ values, onChange }) {
  const field = name => values ? { value: values[name] || '', onChange: event => onChange(name, event.target.value) } : {}
  return <>
    <label>Fecha documental<input name="date" type="date" {...field('date')} /></label>
    <label>Clasificación<input name="classification" maxLength={100} {...field('classification')} /></label>
    <label>Observaciones<textarea name="observations" maxLength={5000} {...field('observations')} /></label>
  </>
}

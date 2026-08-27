import ReportsView from './ReportsView'

function ReviewerBasicReportsView({ globalQuery }) {
  return <ReportsView globalQuery={globalQuery} scope="reviewer" title="Reportes del revisor" />
}

export default ReviewerBasicReportsView

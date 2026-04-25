import { Navigate } from 'react-router-dom'

// Legacy AdminPage — now redirects to the new sidebar-navigated admin layout.
// All admin functionality has been moved to src/pages/admin/ section components.
export default function AdminPage() {
  return <Navigate to="/admin/overview" replace />
}

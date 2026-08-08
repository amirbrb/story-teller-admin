import Button from '@/components/Button'
import common from '@/styles/common.module.css'

export default function NotFound() {
  return (
    <main className={common.page}>
      <h1>Page not found</h1>
      <Button to="/">Back to dashboard</Button>
    </main>
  )
}

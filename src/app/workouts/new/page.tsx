import { redirect } from 'next/navigation'
import { getServerAuthContext } from '@/lib/serverAuth'
import { getAllExercises } from '@/lib/dal'
import TemplateEditor from '../[id]/TemplateEditor'

export default async function NewTemplatePage() {
  const { user } = await getServerAuthContext()
  if (!user) redirect('/')

  const exercises = await getAllExercises()

  return <TemplateEditor exercises={exercises as any} />
}

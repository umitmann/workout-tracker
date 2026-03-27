import { notFound } from 'next/navigation'
import { getAllExercises, getWorkoutWithSets } from '@/lib/dal'
import WorkoutLogger from './WorkoutLogger'

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [workout, exercises] = await Promise.all([
    getWorkoutWithSets(Number(id)),
    getAllExercises(),
  ])

  if (!workout) notFound()

  return <WorkoutLogger workout={workout as any} exercises={exercises as any} />
}

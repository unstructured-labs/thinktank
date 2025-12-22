import type { AppRouter } from '@thinktank/trpc-router'
import { type CreateTRPCReact, createTRPCReact } from '@trpc/react-query'

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>()

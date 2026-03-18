export type EventType =
  | "user.created"
  | "user.deleted"
  | "subscription.created"
  | "subscription.canceled"
  | "invoice.paid"

export type DomainEvent<T extends EventType = EventType> = {
  id: string
  type: T
  payload: Record<string, unknown>
  timestamp: Date
}

import { z } from 'zod';

export const emailSchema = z.string().email();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(100),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/),
  price: z.number().positive(),
  stock: z.number().int().min(0),
});

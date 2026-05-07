import { z } from "zod";

/**
 * Environment variable schema validation using Zod
 * If any required variable is missing (and has no default), the app will throw an error and exit
 */
const envSchema = z.object({
  // Server configuration
  PORT: z
    .string()
    .default("8084")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(65535)),
});

/**
 * Parse and validate environment variables
 * This will throw an error if validation fails, stopping the application
 */
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:");
  parsedEnv.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  });
  console.error("\nPlease check your .env file or environment configuration.");
  process.exit(1);
}

/**
 * Validated environment variables
 * Use this instead of process.env throughout the application
 */
export const env = parsedEnv.data;

/**
 * Type for the validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

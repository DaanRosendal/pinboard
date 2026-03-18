import openapiTS, { astToString } from "openapi-typescript"
import { writeFileSync } from "fs"
import { resolve } from "path"

const API_SPEC_URL = process.env.API_SPEC_URL ?? "http://localhost:4000/openapi.json"

async function main(): Promise<void> {
  const ast = await openapiTS(new URL(API_SPEC_URL))
  const output = astToString(ast)
  const outPath = resolve(__dirname, "../../packages/shared/src/types/api.generated.ts")
  writeFileSync(outPath, output)
  console.log(`Generated types → ${outPath}`)
}

main()

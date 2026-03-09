import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ENV_PATH = resolve(ROOT, ".env.local");
const OUTPUT_PATH = resolve(ROOT, "src/types/database.ts");

function readEnvFile(filePath) {
  const env = {};
  const raw = readFileSync(filePath, "utf8");

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  });

  return env;
}

function toBaseType(schema) {
  if (!schema) return "Json";

  if (schema.type === "array") {
    return `${toBaseType(schema.items)}[]`;
  }

  if (schema.type === "boolean") return "boolean";
  if (schema.type === "integer" || schema.format === "integer" || schema.format === "bigint") {
    return "number";
  }
  if (schema.type === "number" || schema.format === "numeric") return "number";
  if (schema.type === "string") return "string";
  if (schema.format === "json" || schema.format === "jsonb" || schema.type === "object") return "Json";

  return "Json";
}

function toTypeString(schema, required) {
  const baseType = schema?.enum
    ? schema.enum.map((value) => JSON.stringify(value)).join(" | ")
    : toBaseType(schema);

  return required ? baseType : `${baseType} | null`;
}

function pascalCase(value) {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function singularize(value) {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function buildEnumSection(definitions) {
  const enumMap = new Map();

  Object.values(definitions).forEach((definition) => {
    Object.values(definition.properties ?? {}).forEach((property) => {
      if (!property?.enum?.length || typeof property.format !== "string") return;
      const match = property.format.match(/^public\.(.+)$/);
      if (!match) return;
      enumMap.set(match[1], property.enum);
    });
  });

  const entries = [...enumMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";

  return `    Enums: {\n${entries
    .map(([name, values]) => `      ${name}: ${values.map((value) => JSON.stringify(value)).join(" | ")};`)
    .join("\n")}\n    };\n`;
}

function buildTableSection(definitions, tableNames) {
  const blocks = tableNames.map((name) => {
    const definition = definitions[name];
    const required = new Set(definition.required ?? []);
    const properties = definition.properties ?? {};

    const rowFields = Object.entries(properties)
      .map(([key, schema]) => `          ${JSON.stringify(key)}: ${toTypeString(schema, required.has(key))};`)
      .join("\n");

    const insertFields = Object.entries(properties)
      .map(([key, schema]) => {
        const hasDefault = Object.prototype.hasOwnProperty.call(schema, "default");
        const isPrimaryKey = typeof schema?.description === "string" && schema.description.includes("<pk/>");
        const isRequired = required.has(key) && !hasDefault && !isPrimaryKey;
        return `          ${JSON.stringify(key)}${isRequired ? "" : "?"}: ${toTypeString(schema, isRequired)};`;
      })
      .join("\n");

    const updateFields = Object.entries(properties)
      .map(([key, schema]) => `          ${JSON.stringify(key)}?: ${toTypeString(schema, false)};`)
      .join("\n");

    return `      ${JSON.stringify(name)}: {\n        Row: {\n${rowFields}\n        };\n        Insert: {\n${insertFields}\n        };\n        Update: {\n${updateFields}\n        };\n        Relationships: [];\n      };`;
  });

  return `    Tables: {\n${blocks.join("\n")}\n    };\n`;
}

function buildViewSection(definitions, viewNames) {
  const blocks = viewNames.map((name) => {
    const definition = definitions[name];
    const required = new Set(definition.required ?? []);
    const properties = definition.properties ?? {};
    const rowFields = Object.entries(properties)
      .map(([key, schema]) => `          ${JSON.stringify(key)}: ${toTypeString(schema, required.has(key))};`)
      .join("\n");

    return `      ${JSON.stringify(name)}: {\n        Row: {\n${rowFields}\n        };\n        Relationships: [];\n      };`;
  });

  return `    Views: {\n${blocks.join("\n")}\n    };\n`;
}

function buildFunctionSection() {
  return "    Functions: {};\n";
}

function buildAliasSection(tableNames, viewNames) {
  const tableAliases = tableNames
    .map((name) => {
      const singular = singularize(name);
      const alias = pascalCase(singular);
      const typeRoot = `Database["public"]["Tables"][${JSON.stringify(name)}]`;
      return [
        `export type ${alias} = ${typeRoot}["Row"];`,
        `export type ${alias}Insert = ${typeRoot}["Insert"];`,
        `export type ${alias}Update = ${typeRoot}["Update"];`,
      ].join("\n");
    })
    .join("\n\n");

  const viewAliases = viewNames
    .map((name) => {
      const alias = pascalCase(name);
      return `export type ${alias} = Database["public"]["Views"][${JSON.stringify(name)}]["Row"];`;
    })
    .join("\n");

  return `${tableAliases}\n\n${viewAliases}\n`;
}

async function main() {
  const env = {
    ...readEnvFile(ENV_PATH),
    ...process.env,
  };

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: "application/openapi+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Supabase OpenAPI schema: ${response.status} ${response.statusText}`);
  }

  const openApi = await response.json();
  const definitions = openApi.definitions ?? {};
  const definitionNames = Object.keys(definitions).sort();
  const tableNames = definitionNames.filter((name) => !name.startsWith("v_"));
  const viewNames = definitionNames.filter((name) => name.startsWith("v_"));

  const content = `// Generated from the live Supabase PostgREST OpenAPI schema.\n// Run \`npm run db:types:pull\` to refresh.\n\nexport type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[];\n\nexport interface Database {\n  public: {\n${buildEnumSection(definitions)}${buildTableSection(definitions, tableNames)}${buildViewSection(definitions, viewNames)}${buildFunctionSection()}  };\n}\n\nexport type Tables<T extends keyof Database[\"public\"][\"Tables\"]> = Database[\"public\"][\"Tables\"][T][\"Row\"];\nexport type TablesInsert<T extends keyof Database[\"public\"][\"Tables\"]> = Database[\"public\"][\"Tables\"][T][\"Insert\"];\nexport type TablesUpdate<T extends keyof Database[\"public\"][\"Tables\"]> = Database[\"public\"][\"Tables\"][T][\"Update\"];\nexport type Views<T extends keyof Database[\"public\"][\"Views\"]> = Database[\"public\"][\"Views\"][T][\"Row\"];\n\n${buildAliasSection(tableNames, viewNames)}`;

  writeFileSync(OUTPUT_PATH, content);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

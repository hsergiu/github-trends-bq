import fs from 'fs';
import path from 'path';

export class SchemaContextLoader {
  private baseDir: string;
  private baseSchemaPath: string;
  private typeSchemasDir: string;
  private queryExamplesPath: string;
  private extraContextPath: string;

  constructor(schemaKey: string) {
    this.baseDir = path.join(__dirname, './schemas', schemaKey);
    this.baseSchemaPath = path.join(this.baseDir, 'schema.json');
    this.typeSchemasDir = path.join(this.baseDir, 'type');
    this.queryExamplesPath = path.join(this.baseDir, 'examples.json');
    this.extraContextPath = path.join(this.baseDir, 'context.txt');
  }

  loadBaseSchema(): any {
    return JSON.parse(fs.readFileSync(this.baseSchemaPath, 'utf-8'));
  }

  /**
   * Load all type schemas from the type schemas directory.
   * @returns A record of all type schemas.
   */
  getAllTypeSchemas(): Record<string, any> {
    if (!fs.existsSync(this.typeSchemasDir)) return {};
    const files = fs.readdirSync(this.typeSchemasDir);
    const schemas: Record<string, any> = {};
    for (const file of files) {
      if (file.endsWith('.schema.json')) {
        const eventType = file.replace(/\.schema\.json$/, '');
        const schema = JSON.parse(fs.readFileSync(path.join(this.typeSchemasDir, file), 'utf-8'));
        schemas[eventType] = schema;
      }
    }
    return schemas;
  }

  /**
   * Get the context for all type schemas.
   * @returns The context for all type schemas.
   */
  getAllTypeSchemasContext(): string {
    const allSchemas = this.getAllTypeSchemas();
    if (Object.keys(allSchemas).length === 0) return '';

    let context = 'All Type Payload Schemas:\n';
    for (const [eventType, schema] of Object.entries(allSchemas)) {
      context += `\nPayload Schema for ${eventType}:\n${JSON.stringify(schema, null, 2)}\n`;
    }
    return context;
  }

  /**
   * Get the full schema context based on the base schema, type schemas.
   */
  getFullSchemaContext(): string {
    const parts: string[] = [];

    if (fs.existsSync(this.baseSchemaPath)) {
      const baseSchema = this.loadBaseSchema();
      parts.push(`Base Schema:\n${JSON.stringify(baseSchema, null, 2)}`);
    }

    const typeSchemasContext = this.getAllTypeSchemasContext();
    if (typeSchemasContext) parts.push(typeSchemasContext);

    return parts.join('\n\n');
  }
} 
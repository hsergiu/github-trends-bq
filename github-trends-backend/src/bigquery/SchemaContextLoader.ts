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

  getAllTypeSchemasContext(): string {
    const allSchemas = this.getAllTypeSchemas();
    if (Object.keys(allSchemas).length === 0) return '';

    let context = 'All Type Payload Schemas:\n';
    for (const [eventType, schema] of Object.entries(allSchemas)) {
      context += `\nPayload Schema for ${eventType}:\n${JSON.stringify(schema, null, 2)}\n`;
    }
    return context;
  }

  getQueryExamples(): string {
    if (!fs.existsSync(this.queryExamplesPath)) return '';
    return fs.readFileSync(this.queryExamplesPath, 'utf-8');
  }

  getExtraContext(): string {
    if (!fs.existsSync(this.extraContextPath)) return '';
    return fs.readFileSync(this.extraContextPath, 'utf-8');
  }

  getFullSchemaContext(): string {
    const parts: string[] = [];

    if (fs.existsSync(this.baseSchemaPath)) {
      const baseSchema = this.loadBaseSchema();
      parts.push(`Base Schema:\n${JSON.stringify(baseSchema, null, 2)}`);
    }

    const typeSchemasContext = this.getAllTypeSchemasContext();
    if (typeSchemasContext) parts.push(typeSchemasContext);

    const examples = this.getQueryExamples();
    if (examples) parts.push('Query examples:\n' + examples);

    const extra = this.getExtraContext();
    if (extra) parts.push('Additional context:\n' + extra);

    return parts.join('\n\n');
  }
} 
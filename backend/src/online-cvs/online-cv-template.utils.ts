import { BadRequestException } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { OnlineCV } from './entities/online-cv.entity';
import { normalizeCvEntryCollections } from 'src/core/cv-entry-filter';

export function generateCvHtml(cv: OnlineCV): string {
  const compiledDir = join(__dirname, 'templates');
  const sourceDir = join(process.cwd(), 'src', 'online-cvs', 'templates');
  const templatesDir = existsSync(compiledDir) ? compiledDir : sourceDir;
  const templatePath = join(templatesDir, `${cv.templateType}.hbs`);

  if (!existsSync(templatePath)) {
    throw new BadRequestException(
      `Template '${cv.templateType}' không tồn tại`,
    );
  }

  const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'));
  return template(normalizeCvEntryCollections(cv));
}

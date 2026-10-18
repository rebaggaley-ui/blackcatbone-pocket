// For `npm test`: lets Node load the app's TypeScript files, which import each other without the ".ts" (as Metro
// expects). Node strips the types itself; this only finds "./csv" as "./csv.ts".
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(specifier + '.ts', context);
    }
    throw error;
  }
}`),
  import.meta.url
);

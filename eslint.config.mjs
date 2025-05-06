import tseslint from 'typescript-eslint'
import eslint from '@eslint/js'

export default tseslint.config(eslint.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic, {
  ignores: ['**/{dist,docs,coverage,node_modules}/**', 'migrator-example/src/prisma/client/**'],
})

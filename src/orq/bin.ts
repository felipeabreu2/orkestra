#!/usr/bin/env node
import { runOrq } from './orq'

runOrq(process.argv.slice(2), process.env).then(({ code, out }) => {
  if (out) process.stdout.write(out + '\n')
  process.exit(code)
})

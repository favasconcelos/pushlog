// Keep tests independent of the developer's git configuration (signing, identity, hooks, aliases).
process.env.GIT_CONFIG_GLOBAL = '/dev/null'
process.env.GIT_CONFIG_NOSYSTEM = '1'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-direct-db-import",
      severity: "error",
      comment:
        "App and integration code must reach the database through a service or repository.",
      from: {
        path: "^(apps/(builder|worker)|integrations)/",
        // Existing violations are an explicit ratchet baseline. New app or
        // integration imports must go through a service or repository.
        pathNot: [
          "apps/builder/__tests__/integration-sendgrid-api[.]test[.]ts$",
          "apps/builder/__tests__/upload-logo-action[.]test[.]ts$",
          "apps/builder/src/app/integrations/\\[\\.\\.\\.integration\\]/callback[.]ts$",
          "apps/builder/src/app/integrations/\\[\\.\\.\\.integration\\]/webhook[.]ts$",
          "apps/builder/src/features/conversations/queries/build-conversation-where[.]ts$",
          "apps/builder/src/features/dynamic-images/actions/create-dynamic-image[.]action[.]ts$",
          "apps/builder/src/features/dynamic-images/actions/update-dynamic-image[.]action[.]ts$",
          "apps/builder/src/features/error-logs/actions/delete-error-log-action[.]ts$",
          "apps/builder/src/features/integration-instagram/actions/disconnect-instagram[.]ts$",
          "apps/builder/src/features/integration-instagram/actions/update-instagram-action[.]ts$",
          "apps/builder/src/features/integration-instagram/queries/index[.]ts$",
          "apps/builder/src/features/integration-messenger/actions/__tests__/toggle-tag-sync[.]test[.]ts$",
          "apps/builder/src/features/integration-messenger/actions/disconnect-messenger[.]ts$",
          "apps/builder/src/features/integration-messenger/actions/update-messenger-action[.]ts$",
          "apps/builder/src/features/integration-messenger/queries/index[.]ts$",
          "apps/builder/src/features/integration-whatsapp/actions/disconnect[.]action[.]ts$",
          "apps/builder/src/features/integration-whatsapp/automation/actions/update-ice-breakers[.]ts$",
          "apps/builder/src/features/integration-whatsapp/queries/index[.]ts$",
          "apps/builder/src/features/integration-zalo/actions/__tests__/toggle-tag-sync[.]test[.]ts$",
          "apps/builder/src/features/invitations/queries/index[.]ts$",
          "apps/builder/src/features/magic-links/actions/delete-magic-links[.]action[.]ts$",
          "apps/builder/src/features/magic-links/actions/update-magic-link[.]action[.]ts$",
          "apps/builder/src/features/messages/actions/create-webchat-message[.]action[.]ts$",
          "apps/builder/src/features/workspace-members/actions/delete-workspace-member[.]action[.]ts$",
          "apps/builder/src/features/workspace-members/actions/invite-workspace-member[.]action[.]ts$",
          "apps/builder/src/features/workspaces/actions/upload-logo[.]ts$",
          "apps/builder/src/lib/safe-action[.]ts$",
          "apps/worker/__tests__/coexist-whatsapp-flush-lifecycle[.]test[.]ts$",
          "apps/worker/__tests__/messenger-template-handler[.]test[.]ts$",
          "apps/worker/__tests__/send-messenger-template[.]test[.]ts$",
          "apps/worker/__tests__/sync-channel-labels[.]test[.]ts$",
          "apps/worker/__tests__/sync-tag[.]test[.]ts$",
          "apps/worker/__tests__/wa-template-handler[.]test[.]ts$",
          "apps/worker/__tests__/wait-for-chat-job-completion[.]test[.]ts$",
          "apps/worker/src/ai-agent/handlers/process-conversation-source-embedding[.]ts$",
          "apps/worker/src/ai-agent/handlers/process-pending-embeddings[.]ts$",
          "apps/worker/src/chat/handlers/send-message[.]ts$",
          "apps/worker/src/default/handlers/export-contacts[.]ts$",
          "apps/worker/src/default/handlers/imports/handler/contacts/handler[.]ts$",
          "apps/worker/src/default/handlers/send-audit-log[.]ts$",
          "apps/worker/src/default/handlers/sync-channel-labels[.]ts$",
          "apps/worker/src/default/handlers/sync-tag[.]ts$",
          "apps/worker/src/events/error-log/handlers/write-error-log[.]ts$",
          "apps/worker/src/integration/handlers/coexist/attachment-download[.]ts$",
          "apps/worker/src/integration/handlers/coexist/bulk-historical-import[.]ts$",
          "apps/worker/src/integration/handlers/coexist/messenger-sync[.]ts$",
          "apps/worker/src/integration/handlers/flow[.]ts$",
          "apps/worker/src/integration/handlers/received-message[.]ts$",
          "apps/worker/src/integration/handlers/ref[.]ts$",
          "apps/worker/src/integration/handlers/step-handlers[.]ts$",
          "apps/worker/src/integration/utils/message[.]ts$",
          "apps/worker/src/lib/db[.]ts$",
          "apps/worker/src/schedule/handlers/enqueue-broadcast[.]ts$",
          "apps/worker/src/schedule/handlers/maintain-mac-partitions[.]ts$",
          "apps/worker/src/schedule/handlers/prepare-broadcast[.]ts$",
          "apps/worker/src/schedule/handlers/process-broadcast-contacts[.]ts$",
          "apps/worker/src/schedule/handlers/reconcile-broadcasts[.]ts$",
          "apps/worker/src/schedule/handlers/sync-user-quota[.]ts$",
          "apps/worker/src/sequence-scheduler/revert-dispatch[.]ts$",
          "apps/worker/src/sequence-scheduler/services/dispatch-processor[.]service[.]ts$",
          "apps/worker/src/sequence-scheduler/services/retry-scheduler[.]service[.]ts$",
          "apps/worker/src/sequence-scheduler/services/step-executor[.]service[.]ts$",
          "apps/worker/src/sequence-scheduler/services/types[.]ts$",
          "apps/worker/src/sequence-scheduler/worker-producer[.]ts$",
          "apps/worker/src/sequence-scheduler/worker[.]ts$",
          "apps/worker/src/services/integrations[.]ts$",
          "apps/worker/src/trigger/services/action-executor[.]ts$",
          "apps/worker/src/trigger/services/condition-evaluator[.]ts$",
          "apps/worker/src/trigger/services/datetime-trigger-evaluator[.]ts$",
          "apps/worker/src/trigger/services/handoff-executor[.]service[.]ts$",
          "apps/worker/src/trigger/services/trigger-executor[.]service[.]ts$",
          "apps/worker/src/trigger/services/trigger-matcher[.]service[.]ts$",
          "apps/worker/src/webhook/services/webhook-matcher[.]service[.]ts$",
          "apps/worker/src/webhook/services/webhook-payload[.]builder[.]ts$",
        ],
      },
      to: {
        path: "^packages/database/src/client[.]ts$",
      },
    },
    {
      name: "no-circular",
      severity: "warn",
      comment:
        "This dependency is part of a circular relationship. You might want to revise " +
        "your solution (i.e. use dependency inversion, make sure the modules have a single responsibility) ",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      comment:
        "This is an orphan module - it's likely not used (anymore?). Either use it or " +
        "remove it. If it's logical this module is an orphan (i.e. it's a config file), " +
        "add an exception for it in your dependency-cruiser configuration. By default " +
        "this rule does not scrutinize dot-files (e.g. .eslintrc.js), TypeScript declaration " +
        "files (.d.ts), tsconfig.json and some of the babel and webpack configs.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$", // dot files
          "[.]d[.]ts$", // TypeScript declaration files
          "(^|/)tsconfig[.]json$", // TypeScript config
          "(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$", // other configs
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      comment:
        "A module depends on a node core module that has been deprecated. Find an alternative - these are " +
        "bound to exist - node doesn't deprecate lightly.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: [
          "^v8/tools/codemap$",
          "^v8/tools/consarray$",
          "^v8/tools/csvparser$",
          "^v8/tools/logreader$",
          "^v8/tools/profile_view$",
          "^v8/tools/profile$",
          "^v8/tools/SourceMap$",
          "^v8/tools/splaytree$",
          "^v8/tools/tickprocessor-driver$",
          "^v8/tools/tickprocessor$",
          "^node-inspect/lib/_inspect$",
          "^node-inspect/lib/internal/inspect_client$",
          "^node-inspect/lib/internal/inspect_repl$",
          "^async_hooks$",
          "^punycode$",
          "^domain$",
          "^constants$",
          "^sys$",
          "^_linklist$",
          "^_stream_wrap$",
        ],
      },
    },
    {
      name: "not-to-deprecated",
      comment:
        "This module uses a (version of an) npm module that has been deprecated. Either upgrade to a later " +
        "version of that module, or find an alternative. Deprecated modules are a security risk.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["deprecated"],
      },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      comment:
        "This module depends on an npm package that isn't in the 'dependencies' section of your package.json. " +
        "That's problematic as the package either (1) won't be available on live (2 - worse) will be " +
        "available on live with an non-guaranteed version. Fix it by adding the package to the dependencies " +
        "in your package.json.",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
      },
    },
    {
      name: "not-to-unresolvable",
      comment:
        "This module depends on a module that cannot be found ('resolved to disk'). If it's an npm " +
        "module: add it to your package.json. In all other cases you likely already know what to do.",
      severity: "error",
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: "no-duplicate-dep-types",
      comment:
        "Likely this module depends on an external ('npm') package that occurs more than once " +
        "in your package.json i.e. bot as a devDependencies and in dependencies. This will cause " +
        "maintenance problems later on.",
      severity: "warn",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        // as it's common to use a devDependency for type-only imports: don't
        // consider type-only dependencyTypes for this rule
        dependencyTypesNot: ["type-only"],
      },
    },

    // rules you might want to tweak for your specific situation:

    {
      name: "not-to-spec",
      comment:
        "This module depends on a spec (test) file. The responsibility of a spec file is to test code. " +
        "If there's something in a spec that's of use to other modules, it doesn't have that single " +
        "responsibility anymore. Factor it out into (e.g.) a separate utility/ helper or a mock.",
      severity: "error",
      from: {},
      to: {
        path: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "This module depends on an npm package from the 'devDependencies' section of your " +
        "package.json. It looks like something that ships to production, though. To prevent problems " +
        "with npm packages that aren't there on production declare it (only!) in the 'dependencies'" +
        "section of your package.json. If this module is development only - add it to the " +
        "from.pathNot re of the not-to-dev-dep rule in the dependency-cruiser configuration",
      from: {
        path: "^(apps)",
        pathNot: "[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$",
      },
      to: {
        dependencyTypes: ["npm-dev"],
        // type only dependencies are not a problem as they don't end up in the
        // production code or are ignored by the runtime.
        dependencyTypesNot: ["type-only"],
        pathNot: ["node_modules/@types/"],
      },
    },
    {
      name: "optional-deps-used",
      severity: "info",
      comment:
        "This module depends on an npm package that is declared as an optional dependency " +
        "in your package.json. As this makes sense in limited situations only, it's flagged here. " +
        "If you use an optional dependency here by design - add an exception to your" +
        "dependency-cruiser configuration.",
      from: {},
      to: {
        dependencyTypes: ["npm-optional"],
      },
    },
    {
      name: "peer-deps-used",
      comment:
        "This module depends on an npm package that is declared as a peer dependency " +
        "in your package.json. This makes sense if your package is e.g. a plugin, but in " +
        "other cases - maybe not so much. If the use of a peer dependency is intentional " +
        "add an exception to your dependency-cruiser configuration.",
      severity: "warn",
      from: {},
      to: {
        dependencyTypes: ["npm-peer"],
      },
    },
  ],
  options: {
    // Which modules not to follow further when encountered
    doNotFollow: {
      // path: an array of regular expressions in strings to match against
      path: ["node_modules"],
    },

    // Which modules to exclude
    // exclude : {
    //   // path: an array of regular expressions in strings to match against
    //   path: '',
    // },

    // Which modules to exclusively include (array of regular expressions in strings)
    // dependency-cruiser will skip everything that doesn't match this pattern
    // includeOnly : [''],

    // List of module systems to cruise.
    // When left out dependency-cruiser will fall back to the list of _all_
    // module systems it knows of ('amd', 'cjs', 'es6', 'tsd']). It's the
    // default because it's the safe option. It comes at a performance penalty, though
    // As in practice only commonjs ('cjs') and ecmascript modules ('es6')
    // are in wide use, you can limit the moduleSystems to those.
    // moduleSystems: ['cjs', 'es6'],

    // false: don't look at JSDoc imports (the default)
    // true: detect dependencies in JSDoc-style import statements.
    // Implies parser: 'tsc', which a.o. means the typescript compiler will need
    // to be installed in the same spot you run dependency-cruiser from.
    // detectJSDocImports: true,

    // false: don't look at process.getBuiltinModule calls (the default)
    // true: dependency-cruiser will detect calls to process.getBuiltinModule/
    // globalThis.process.getBuiltinModule as imports.
    detectProcessBuiltinModuleCalls: true,

    // prefix for links in html, d2, mermaid and dot/ svg output (e.g. 'https://github.com/you/yourrepo/blob/main/'
    // to open it on your online repo or `vscode://file/${process.cwd()}/` to
    // open it in visual studio code),
    // prefix: `vscode://file/${process.cwd()}/`,

    // suffix for links in output. E.g. put .html here if you use it to link to
    // your coverage reports.
    // suffix: '.html',

    // false (the default): ignore dependencies that only exist before typescript-to-javascript compilation
    // true: also detect dependencies that only exist before typescript-to-javascript compilation
    // 'specify': for each dependency identify whether it only exists before compilation or also after
    tsPreCompilationDeps: true,

    // list of extensions to scan that aren't javascript or compile-to-javascript.
    // Empty by default. Only put extensions in here that you want to take into
    // account that are _not_ parsable.
    // extraExtensionsToScan: ['.json', '.jpg', '.png', '.svg', '.webp'],

    // if true combines the package.jsons found from the module up to the base
    // folder the cruise is initiated from. Useful for how (some) mono-repos
    // manage dependencies & dependency definitions.
    // combinedDependencies: false,

    // if true leave symlinks untouched, otherwise use the realpath
    // preserveSymlinks: false,

    // TypeScript project file ('tsconfig.json') to use for
    // (1) compilation and
    // (2) resolution (e.g. with the paths property)
    //
    // The (optional) fileName attribute specifies which file to take (relative to
    // dependency-cruiser's current working directory). When not provided
    // defaults to './tsconfig.json'.
    tsConfig: {
      fileName: "tsconfig.json",
    },

    // Webpack configuration to use to get resolve options from.
    //
    // The (optional) fileName attribute specifies which file to take (relative
    // to dependency-cruiser's current working directory. When not provided defaults
    // to './webpack.conf.js'.
    //
    // The (optional) 'env' and 'arguments' attributes contain the parameters
    // to be passed if your webpack config is a function and takes them (see
    //  webpack documentation for details)
    // webpackConfig: {
    //  fileName: 'webpack.config.js',
    //  env: {},
    //  arguments: {}
    // },

    // Babel config ('.babelrc', '.babelrc.json', '.babelrc.json5', ...) to use
    // for compilation
    // babelConfig: {
    //   fileName: '.babelrc',
    // },

    // List of strings you have in use in addition to cjs/ es6 requires
    // & imports to declare module dependencies. Use this e.g. if you've
    // re-declared require, use a require-wrapper or use window.require as
    // a hack.
    // exoticRequireStrings: [],

    // options to pass on to enhanced-resolve, the package dependency-cruiser
    // uses to resolve module references to disk. The values below should be
    // suitable for most situations
    //
    // If you use webpack: you can also set these in webpack.conf.js. The set
    // there will override the ones specified here.
    enhancedResolveOptions: {
      // What to consider as an 'exports' field in package.jsons
      exportsFields: ["exports"],

      // List of conditions to check for in the exports field.
      // Only works when the 'exportsFields' array is non-empty.
      conditionNames: ["import", "require", "node", "default", "types"],

      // The extensions, by default are the same as the ones dependency-cruiser
      // can access (run `npx depcruise --info` to see which ones that are in
      // _your_ environment). If that list is larger than you need you can pass
      // the extensions you actually use (e.g. ['.js', '.jsx']). This can speed
      // up module resolution, which is the most expensive step.
      // extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"],

      // What to consider a 'main' field in package.json

      // if you migrate to ESM (or are in an ESM environment already) you will want to
      // have "module" in the list of mainFields, like so:
      // mainFields: ["module", "main", "types", "typings"],
      mainFields: ["main", "types", "typings"],

      // A list of alias fields in package.jsons
      // See https://github.com/defunctzombie/package-browser-field-spec and
      // the webpack [resolve.alias](https://webpack.js.org/configuration/resolve/#resolvealiasfields)
      // documentation.
      // Defaults to an empty array (= don't use alias fields).
      // aliasFields: ['browser'],
    },

    // skipAnalysisNotInRules will make dependency-cruiser execute
    // analysis strictly necessary for checking the rule set only.
    // See https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md#skipanalysisnotinrules
    skipAnalysisNotInRules: true,

    reporterOptions: {
      dot: {
        // Pattern of modules to consolidate to. The default pattern in this configuration
        // collapses everything in node_modules to one folder deep so you see
        // the external modules, but not their innards.
        collapsePattern: "node_modules/(?:@[^/]+/[^/]+|[^/]+)",

        // Options to tweak the appearance of your graph. See
        // https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md#reporteroptions
        // If you don't specify a theme dependency-cruiser falls back to a built-in one.
        // theme: {
        //   graph: {
        //     // splines: 'ortho' - straight lines; slow on big graphs
        //     // splines: 'true' - bezier curves; fast but not as nice as ortho
        //     splines: 'true'
        //   },
        // },
      },
      archi: {
        // Pattern of modules to consolidate to.
        collapsePattern:
          "^(?:packages|src|lib(s?)|app(s?)|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)",

        // Options to tweak the appearance of your graph. If you don't specify a
        // theme for 'archi' dependency-cruiser will use the one specified in the
        // dot section above and otherwise use the default one.
        // theme: { },
      },
      text: {
        highlightFocused: true,
      },
    },
  },
}
// generated: dependency-cruiser@17.3.9 on 2026-03-26T08:49:27.449Z

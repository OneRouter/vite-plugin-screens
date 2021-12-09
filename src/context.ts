import path from 'path';

import { transformWithEsbuild, ViteDevServer } from 'vite';
import { generate } from './codegen';

import { MODULE_ID_VIRTUAL } from './const';
import { resolveOptions, resolvePages, resolveRoutes } from './resolver';
import { UserOptions, ResolvedOptions, ResolvedPages } from './types';
import { debug } from './utils';

export function isTarget(p: string, options: ResolvedOptions) {
  return (
    p.startsWith(path.resolve(options.pageDir)) &&
    options.extensions.some(ext => p.endsWith(ext))
  );
}

export class Context {
  private _userOptions?: UserOptions;
  private _resolvedOptions?: ResolvedOptions;
  private _pages: ResolvedPages = new Map();
  private _server: ViteDevServer | null = null;

  public root: string = '.';

  constructor(userOptions?: UserOptions) {
    this._userOptions = userOptions;
  }

  public resolveOptions() {
    this._resolvedOptions = resolveOptions(this._userOptions, this.root);
  }

  public search() {
    if (!this._resolvedOptions) {
      this.resolveOptions();
    }
    this._pages = resolvePages(this._resolvedOptions!);
    debug('pages: ', this._pages);
  }

  public configureServer(server: ViteDevServer) {
    this._server = server;
    this._server.watcher.on('unlink', filaPath =>
      this.invalidateVirtualModule(filaPath)
    );
    this._server.watcher.on('add', filaPath =>
      this.invalidateVirtualModule(filaPath)
    );
  }

  public invalidateVirtualModule(filaPath: string) {
    if (!isTarget(filaPath, this._resolvedOptions!)) {
      return;
    }

    this._pages.clear();
    const module = this._server!.moduleGraph.getModuleById(MODULE_ID_VIRTUAL);
    if (module) {
      this._server!.moduleGraph.invalidateModule(module);
    }
  }

  public async generateVirtualModuleCode() {
    debug(
      'generating virtual module code...',
      this._pages,
      this._resolvedOptions
    );
    if (this._pages.size === 0) {
      this.search();
    }
    const routes = resolveRoutes(this._pages, this._resolvedOptions!);
    debug('routes: ', routes);
    const { code } = await transformWithEsbuild(
      generate(routes, this._resolvedOptions!),
      'routes.jsx',
      {
        jsx: 'transform',
        loader: 'jsx',
      }
    );

    debug('virtual module code: ', code);
    return code;
  }
}

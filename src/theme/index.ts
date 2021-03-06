import * as fs from 'fs';
import * as path from 'path';

import { DeclarationReflection, ProjectReflection, Reflection } from 'typedoc/dist/lib/models/reflections/index';
import { ReflectionKind } from 'typedoc/dist/lib/models/reflections/index';
import { UrlMapping } from 'typedoc/dist/lib/output/models/UrlMapping';
import { Renderer } from 'typedoc/dist/lib/output/renderer';
import { DefaultTheme } from 'typedoc/dist/lib/output/themes/DefaultTheme';
import { ThemeService } from './service';

export class MarkdownTheme extends DefaultTheme {

  /**
   * This is mostly a copy of the DefaultTheme method with .html ext switched to .md
   * Builds the url for the the given reflection and all of its children.
   *
   * @param reflection  The reflection the url should be created for.
   * @param urls The array the url should be appended to.
   * @returns The altered urls array.
   */
  public static buildUrls(reflection: DeclarationReflection, urls: UrlMapping[]): UrlMapping[] {

    const mapping = DefaultTheme.getMapping(reflection);

    if (mapping) {
      if (!reflection.url || !DefaultTheme.URL_PREFIX.test(reflection.url)) {
        const url = [mapping.directory, DefaultTheme.getUrl(reflection) + '.md'].join('/');
        urls.push(new UrlMapping(url, reflection, mapping.template));
        reflection.url = url;
        reflection.hasOwnDocument = true;
      }
      for (const key in reflection.children) {
        if (reflection.children.hasOwnProperty(key)) {
          const child = reflection.children[key];
          if (mapping.isLeaf) {
            MarkdownTheme.applyAnchorUrl(child, reflection);
          } else {
            MarkdownTheme.buildUrls(child, urls);
          }
        }
      }
    } else {
      MarkdownTheme.applyAnchorUrl(reflection, reflection.parent);
    }

    return urls;
  }

  /**
   * Similar to DefaultTheme method with added functionality to cater for bitbucket heading and single file anchors
   * Generate an anchor url for the given reflection and all of its children.
   *
   * @param reflection  The reflection an anchor url should be created for.
   * @param container   The nearest reflection having an own document.
   */
  public static applyAnchorUrl(reflection: Reflection, container: Reflection) {

    const options = ThemeService.getOptions();

    if (!reflection.url || !DefaultTheme.URL_PREFIX.test(reflection.url)) {

      let anchor = DefaultTheme.getUrl(reflection, container, '.');
      /* tslint:disable */
      if (reflection['isStatic']) {
        anchor = 'static-' + anchor;
      }
      /* tslint:enable */

      let anchorRef = '';

      switch (reflection.kind) {
        case ReflectionKind.ExternalModule:
          anchorRef = `external-module-${ThemeService.getAnchorRef(reflection.name)}-`;
          break;
        case ReflectionKind.Class:
          anchorRef = `class-${ThemeService.getAnchorRef(reflection.name)}`;
          break;
        case ReflectionKind.Interface:
          anchorRef = `interface-${ThemeService.getAnchorRef(reflection.name)}`;
          break;
        case ReflectionKind.Module:
          anchorRef = `module-${ThemeService.getAnchorRef(reflection.name)}`;
        case ReflectionKind.Enum:
          if (reflection.parent.kind === 0 || reflection.parent.kind === ReflectionKind.ExternalModule) {
            anchorRef = `module-${ThemeService.getAnchorRef(reflection.name)}`;
          } else {
            anchorRef = `enumeration-${ThemeService.getAnchorRef(reflection.name)}`;
          }
          break;
        default:
          if (options.mdFlavour === 'bitbucket') {
            let anchorPrefix = '';
            if (reflection.kind === ReflectionKind.ObjectLiteral) {
              anchorPrefix += 'object-literal-';
            }
            reflection.flags.forEach((flag) => {
              anchorPrefix += `${flag}-`;
            });
            const prefixRef = ThemeService.getAnchorRef(anchorPrefix);
            const reflectionRef = ThemeService.getAnchorRef(reflection.name);
            anchorRef = `markdown-header-${prefixRef}${reflectionRef}`;
          } else {
            anchorRef = anchor;
          }

      }

      reflection.url = (container.url !== undefined ? container.url : '') + '#' + anchorRef;
      reflection.anchor = anchor;
      reflection.hasOwnDocument = false;

    }

    reflection.traverse((child: any) => {
      if (child instanceof DeclarationReflection) {
        MarkdownTheme.applyAnchorUrl(child, container);
      }
    });
  }

  constructor(renderer: Renderer, basePath: string, options: any) {
    super(renderer, basePath);

    // remove uneccessary plugins
    renderer.removeComponent('assets');
    renderer.removeComponent('javascript-index');
    renderer.removeComponent('navigation');
    renderer.removeComponent('toc');
    renderer.removeComponent('pretty-print');

    // assign global theme service props
    ThemeService.options = options;
    ThemeService.resources = this.resources;

  }

  /**
   * Test whether the given path contains a documentation generated by this theme.
   *
   * @param path  The path of the directory that should be tested.
   * @returns     TRUE if the given path seems to be a previous output directory,
   *              otherwise FALSE.
   */
  public isOutputDirectory(outPath: string): boolean {
    const files = fs.readdirSync(outPath);
    return fs.existsSync(path.join(outPath, 'README.md')) || (files.length === 1 && path.extname(files[0]) === '.md');
  }

  /**
   * Map the models of the given project to the desired output files.
   *
   * @param project  The project whose urls should be generated.
   * @returns        A list of [[UrlMapping]] instances defining which models
   *                 should be rendered to which files.
   */
  public getUrls(project: ProjectReflection): UrlMapping[] {

    const urls: UrlMapping[] = [];
    const entryPoint = this.getEntryPoint(project);

    ThemeService.projectName = entryPoint.name;

    // pass in additional context
    const additionalContext = {
      displayReadme: this.application.options.getValue('readme') !== 'none',
      hideBreadcrumbs: true,
      isIndex: true,
    };

    const context = Object.assign(entryPoint, additionalContext);

    urls.push(new UrlMapping('README.md', context, 'reflection.hbs'));

    if (entryPoint.children) {
      entryPoint.children.forEach((child: DeclarationReflection) => {
        MarkdownTheme.buildUrls(child, urls);
      });
    }

    return urls;
  }

}

import type { Cheerio } from 'cheerio/lib/cheerio';
import type { Element } from 'domhandler';

export class NormalFunc {
  helpElAttr($el: Cheerio<Element>, attr: string): string {
    return $el?.attr(attr) || '';
  }

  helpElText($el: Cheerio<Element>): string {
    return $el?.text() || '';
  }

  helpGetItems(...items: (() => Cheerio<Element>)[]): Cheerio<Element> {
    let res = null;
    items.forEach((func) => {
      if (res === null) {
        const foo = func();
        if (foo.length > 0) {
          res = foo;
        }
      }
    });
    return res || items[0]();
  }
}

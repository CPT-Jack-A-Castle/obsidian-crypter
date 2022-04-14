import { Plugin, setIcon, View } from "obsidian";
import { RangeSetBuilder } from "@codemirror/rangeset";
import { EditorView, Decoration, DecorationSet, ViewUpdate, WidgetType, ViewPlugin } from "@codemirror/view";
import { EditorState, EditorSelection, TransactionSpec, Transaction } from "@codemirror/state";
import { syntaxTree, foldable } from "@codemirror/language";
// import { tokenClassNodeProp } from "@codemirror/stream-parser";
import { foldEffect, unfoldEffect, foldedRanges } from "@codemirror/fold";
import { log } from "console";

export default class AttributesPlugin extends Plugin {
  async onload() {
    const ext = this.buildAttributesViewPlugin();
    this.registerEditorExtension(ext);
  }

  buildAttributesViewPlugin() {
    // build the DOM element that we'll prepend to list elements
    class FoldWidget extends WidgetType {
      from: number;
      to: number;
      view: EditorView;

      constructor(view: EditorView, from: number, to: number) {
        super();
        this.view = view;
        this.from = from;
        this.to = to;
      }

      eq(other: FoldWidget) {
        return this.from == other.from
      }

      toDOM() {

        let el: HTMLInputElement = document.createElement("input");
        el.type = "text";
        el.className = "secret";
        // el.className = "cm-fold-widget collapse-indicator collapse-icon";
        // if (this.isFolded) el.addClass("is-collapsed");
        // this.isHeader ? el.addClass("heading-collapse-indicator") : el.addClass("list-collapse-indicator");
        // setIcon(el, "right-triangle", 8);
        el.setAttr("type", "text");
        el.style.caretColor = "initial";

        let view = this.view;
        let from = this.from;
        let to = this.to;

        el.addEventListener("change", function (e) {
          let encrypted = el.value.split("").reverse().join("");
          // var txt = new Text(encrypted);
          // view.state.doc.replace(from, to, txt);

          let changes = []
          changes.push({ from: from, to: to, insert: encrypted });
          view.dispatch({ changes })

        }, false);

        let sliceString = this.view.state.doc.sliceString(this.from, this.to)
        let decrypted = sliceString.split("").reverse().join("");
        el.value = decrypted;

        return el;
      }

      ignoreEvent() {
        return true;
      }
    }

    const viewPlugin = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        lineCache: {}; // TODO: Implement caching
        tokenCache: {}; // TODO: Implement caching

        constructor(view: EditorView) {
          this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
          } else if (update.geometryChanged) {
            // this logic is to update the fold widget icons since a fold
            // does not trigger docChanged or viewportChanged
            // there's probably a better way to do this
            for (let tr of update.transactions) {
              for (let effect of tr.effects) {
                if (effect && effect.value) {
                  if (effect.is(foldEffect) || effect.is(unfoldEffect)) {
                    this.decorations = this.buildDecorations(update.view);
                  }
                }
              }
            }
          }
          // console.timeEnd("build deco");
        }

        destroy() { }

        buildDecorations(view: EditorView) {
          const hashTagRegexp = /#(?:[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s])+/g;
          let builder = new RangeSetBuilder<Decoration>();
          // use view.visibleRanges rather than view.viewPort since visibleRanges will filter out folded and non visible ranges
          try {
            // syntaxTree gives us access to the tokens generated by the markdown parser
            // here we iterate over the visible text and evaluate each token, sequentially.
            const from = view.viewport.from;
            const to = view.viewport.to;
            const tree = syntaxTree(view.state);
            var inTag = false;
            var inContent = false;

            let contentFrom: number;
            let contentTo: number;

            let tagFrom: number;
            let tagTo: number;

            tree.iterate({
              from,
              to,
              enter: (type, from, to) => {
                // To access the parsed tokens, we need to use a NodeProp.
                // Obsidian exports their inline token NodeProp, tokenClassNodeProp, as part of their
                // custom stream-parser package. See the readme for more details.

                // const tokenProps = type.prop(tokenClassNodeProp);

                // console.log(type.name + "|" + type.id);

                if (true) {
                  // const props = new Set(tokenProps.split(" "));
                  const isTag = false;
                  const isList = true;
                  const isHeader = false;
                  const isBarelink = false;

                  // if (type.name == "tag") {
                  let sliceString = view.state.doc.sliceString(from, to)
                  // console.log("Slice (" + from + ", " + to + "): " + sliceString);
                  // }

                  // console.log(type.name == "tag");
                  // console.log(txt == "crypt");

                  if (type.name == "tag" && sliceString == "secret") {
                    tagFrom = from - 1;
                    inTag = true;
                    // console.log("DBG: Found Tag 1");
                  }

                  if (type.name == "bracket_tag" && inTag && sliceString == ">") {
                    inContent = true;
                    contentFrom = to;
                    // console.log("DBG: Found Tag 2");
                  }

                  let isCrypt = false;
                  if (type.name == "bracket_tag" && inContent && sliceString == "</") {
                    contentTo = from;
                    tagTo = from + "</secret>".length;
                    // console.log("DBG: Found Content");

                    inContent = false;
                    inTag = false;
                    isCrypt = true;

                    // let txt2 = view.state.doc.sliceString(contentFrom, from)
                    // console.log("CONTENT: " + txt2);
                  }

                  if (isCrypt) {
                    console.log("widget adding (" + contentFrom + ", " + contentTo + ")");
                    let deco = Decoration.replace({
                      widget: new FoldWidget(view, contentFrom, contentTo),
                      inclusive: true,
                    });
                    builder.add(tagFrom, tagTo, deco);
                    console.log("widget added");
                  }

                  // if (isList || isHeader) {
                  //   // add a fold icon, inline, next to every foldable list item
                  //   // TODO: fix the naive negative margin in styles.css
                  //   let range,
                  //     line = view.state.doc.lineAt(from);
                  //   if ((range = foldable(view.state, line.from, line.to))) {
                  //     const isFolded = foldExists(view.state, range.from, range.to);
                  //     let deco = Decoration.widget({
                  //       widget: new FoldWidget(isFolded, isHeader),
                  //     });
                  //     builder.add(from, from, deco);
                  //   }
                  // }
                  // if (isTag) {
                  //   // This adds a data-tags attribute to the parent cm-line.
                  //   // The attribute value will be a list of all tags found on the line
                  //   // TODO: this currently recomputes the entire list of hashtags for a given
                  //   // line once for every hashtag found. it works but it could be better.
                  //   let line = view.state.doc.lineAt(from);
                  //   let deco = Decoration.line({
                  //     attributes: { "data-tags": line.text.match(hashTagRegexp)?.join(" ").replace(/#/g, "") },
                  //   });
                  //   // TODO: Figure out a better way to fix the pos conflict when
                  //   //       a top level list item has a hashtag at the beginning of the line
                  //   // The code below is a hack using internal class properties
                  //   if ((<any>builder).lastFrom == line.from) {
                  //     // if we don't do this, we get an error stating our rangeset is not sorted
                  //     deco.startSide = (<any>builder).last.startSide + 1;
                  //   }
                  //   builder.add(line.from, line.from, deco);
                  // }
                  // if (isBarelink) {
                  //   // add the value of barelinks as an href on the inline element
                  //   // this will cause a nested span to be created
                  //   let deco = Decoration.mark({
                  //     attributes: { href: view.state.doc.sliceString(from, to) },
                  //   });
                  //   builder.add(from, to, deco);
                  // }
                }
              },
            });
          } catch (err) {
            // cm6 will silently unload extensions when they crash
            // this try/catch will provide details when crashes occur
            console.error("Custom CM6 view plugin failure", err);
            // make to to throw because if you don't, you'll block
            // the auto unload and destabilize the editor
            throw err;
          }
          return builder.finish();
        }
      },
      {
        decorations: v => v.decorations,

        eventHandlers: {
          // create an event handler for our new fold widget
          mousedown: (e, view) => {
            // TODO: only act on left click
            let target = (e.target as HTMLElement).closest(".cm-fold-widget");
            if (target) {
              const foldMarkerPos = view.posAtDOM(target);
              const line = view.state.doc.lineAt(foldMarkerPos);
              let range = foldable(view.state, line.from, line.to);
              if (range) {
                let curPos = view.state.selection.main.head;
                let effect = foldExists(view.state, range.from, range.to) ? unfoldEffect : foldEffect;
                let transaction: TransactionSpec = { effects: [effect.of(range), announceFold(view, range)] };
                if (curPos > range.from && curPos < range.to) {
                  transaction.selection = EditorSelection.cursor(range.to);
                }
                view.dispatch(transaction);
                return true;
              }
            }
          },
        },
      }
    );

    return viewPlugin;
  }
}

function foldExists(state: EditorState, from: number, to: number) {
  // adapted from https://github.com/codemirror/fold/blob/36ca2ec57aa3907fb0d1c13669b51e98e379e583/src/fold.ts#L76
  const folded = foldedRanges(state);
  let found = false;
  folded.between(from, from, (a, b) => {
    if (a == from && b == to) found = true;
  });
  return found;
}

function announceFold(view: EditorView, range: { from: number; to: number }, fold = true) {
  // copied from https://github.com/codemirror/fold/blob/36ca2ec57aa3907fb0d1c13669b51e98e379e583/src/fold.ts#L110
  let lineFrom = view.state.doc.lineAt(range.from).number,
    lineTo = view.state.doc.lineAt(range.to).number;
  return EditorView.announce.of(
    `${view.state.phrase(fold ? "Folded lines" : "Unfolded lines")} ${lineFrom} ${view.state.phrase("to")} ${lineTo}.`
  );
}
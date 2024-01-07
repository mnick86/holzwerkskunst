import {Injectable} from '@angular/core';
import {ComponentStore, tapResponse} from '@ngrx/component-store';
import {Product} from './product';
import {of, switchMap} from 'rxjs';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';

export interface AppState {
  products: Product[];
  sidebarVisible: boolean;
  showContact: boolean;
}

const initialState: AppState = {products: [], sidebarVisible: false, showContact: false};

@Injectable({providedIn: 'root'})
export class AppStore extends ComponentStore<AppState> {
  constructor(public http: HttpClient) {
    super(initialState);
    this.getProducts();
  }

  selectProducts$ = this.select((state) => {
    const products = state.products;
    products.sort((p1, p2) => p1.name.localeCompare(p2.name));
    for (const product of products) {
      product.images.sort((i1, i2) => i1.small.localeCompare(i2.small));
    }
    return products;
  });

  selectSidebarVisible$ = this.select((state) => state.sidebarVisible);
  selectTags$ = this.select(this.selectProducts$, (products) => {
    const result = [...new Set(([] as string[]).concat(...products.map((p) => p.tags)))];
    return result.sort();
  });
  selectShowContact$ = this.select((state) => state.showContact);

  setSidebarVisible = this.updater((state, visible: boolean) => {
    state.sidebarVisible = visible;
    return state;
  });

  setShowContact = this.updater((state, showContact: boolean) => {
    state.showContact = showContact;
    return state;
  });

  readonly getProducts = this.effect((_) => {
    return _.pipe(
      switchMap(() =>
        this.http.get<Product[]>('products.json').pipe(
          tapResponse(
            (products) => {
              this.patchState({products});
            },
            (error: HttpErrorResponse) => this.logError(error),
          ),
        ),
      ),
    );
  });

  logError(err: any) {
    console.error(err);
  }
}

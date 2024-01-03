import {Injectable} from '@angular/core';
import {ComponentStore, tapResponse} from '@ngrx/component-store';
import {Product} from './product';
import {of, switchMap} from 'rxjs';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';

export interface AppState {
  products: Product[];
  sidebarVisible: boolean;
}

const initialState: AppState = {products: [], sidebarVisible: false};

@Injectable({providedIn: 'root'})
export class AppStore extends ComponentStore<AppState> {
  constructor(public http: HttpClient) {
    super(initialState);
    this.getProducts();
  }

  selectProducts$ = this.select((state) => {
    const products = state.products;
    return products;
  });

  selectSidebarVisible$ = this.select((state) => state.sidebarVisible);
  selectTags$ = this.select(this.selectProducts$, (products) => {
    const result = [...new Set(([] as string[]).concat(...products.map((p) => p.tags)))];
    return result.sort();
  });

  setSidebarVisible = this.updater((state, visible: boolean) => {
    state.sidebarVisible = visible;
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

import {Injectable} from '@angular/core';
import {ComponentStore, tapResponse} from '@ngrx/component-store';
import {map, of, switchMap} from 'rxjs';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {ActivatedRoute} from '@angular/router';
import {AppStore} from '../../+store/app.store';

export interface ProductsForTagState {}

@Injectable()
export class ProductsForTagStore extends ComponentStore<ProductsForTagState> {
  constructor(
    public route: ActivatedRoute,
    public appStore: AppStore,
  ) {
    super({});
  }

  selectTag$ = this.route.params.pipe(map((params) => params['tag']));

  selectProductsForTag$ = this.select(
    this.selectTag$,
    this.appStore.selectProducts$,
    (tag, products) => {
      return products.filter((p) => p.tags.includes(tag));
    },
  );
}

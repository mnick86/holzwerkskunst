import {Injectable} from '@angular/core';
import {ComponentStore, tapResponse} from '@ngrx/component-store';
import {map, of, switchMap} from 'rxjs';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {ActivatedRoute} from '@angular/router';
import {AppStore} from '../../+store/app.store';

export interface ProductState {}

@Injectable()
export class ProductStore extends ComponentStore<ProductState> {
  constructor(
    public route: ActivatedRoute,
    public appStore: AppStore,
  ) {
    super({});
  }

  selectProductIdFromRoute$ = this.route.params.pipe(map((params) => params['id']));

  selectProduct$ = this.select(
    this.selectProductIdFromRoute$,
    this.appStore.selectProducts$,
    (id, products) => {
      return products.find((p) => p.id === id) || null;
    },
  );
}

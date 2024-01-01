import { Injectable } from "@angular/core";
import { ComponentStore, tapResponse } from "@ngrx/component-store";
import { Product, mockData } from "./product";
import { of, switchMap } from "rxjs";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";

export interface AppState {
    products: Product[];
  }
  
  @Injectable({providedIn: 'root'})
  export class AppStore extends ComponentStore<AppState> {
    
    constructor(http: HttpClient) {
      super({products: []});
      this.getProducts();
    }

    selectProducts$ = this.select(state => state.products);

    readonly getProducts = this.effect((_) => {
        return _.pipe(
          // 👇 Handle race condition with the proper choice of the flattening operator.
          switchMap(() => of(mockData).pipe(
            //👇 Act on the result within inner pipe.
            tapResponse(
              (products) => {console.log(products); this.patchState({products})},
              (error: HttpErrorResponse) => this.logError(error),
            ),
          )),
        );
      });

      logError(err: any) {
        console.error(err);
      }
  }
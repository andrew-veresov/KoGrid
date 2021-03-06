window.kg.SelectionService = function (grid) {
    var self = this;
    self.multi = grid.config.multiSelect;
    self.selectedItems = grid.config.selectedItems;
    self.selectedCells = grid.config.selectedCells;
    self.selectedIndex = grid.config.selectedIndex;
    self.lastClickedRow = undefined;
    self.ignoreSelectedItemChanges = false; // flag to prevent circular event loops keeping single-select var in sync

    self.rowFactory = {};
    self.Initialize = function (rowFactory) {
        self.rowFactory = rowFactory;
    };

    function isTouchClick(evt) {
        if (evt.type !== "click") return false;
        if (evt.pointerType === "touch") return true;
        if (evt.pointerType == undefined && evt.originalEvent != undefined) return isTouchClick(evt.originalEvent);
        return false;
    }
        
    // function to manage the selection action of a data item (entity)
    self.ChangeSelection = function (rowItem, evt) {
        grid.$$selectionPhase = true;
        if (evt && !(evt.ctrlKey || evt.shiftKey || isTouchClick(evt) || grid.config.selectionMode === "touch") && self.multi) {
            // clear selection
            self.toggleSelectAll(false);
        }
        if (evt && evt.shiftKey && self.multi) {
            if (self.lastClickedRow) {
                var thisIndx = self.rowFactory.parsedData.indexOf(rowItem.entity);
                var prevIndx = self.rowFactory.parsedData.indexOf(self.lastClickedRow.entity);
                if (thisIndx == -1) thisIndx = grid.filteredData().indexOf(rowItem.entity);
                if (prevIndx == -1) prevIndx = grid.filteredData().indexOf(self.lastClickedRow.entity);


                if (thisIndx == prevIndx) {
                    grid.$$selectionPhase = false;
                    return false;
                }
                if (thisIndx < prevIndx) {
                    thisIndx = thisIndx ^ prevIndx;
                    prevIndx = thisIndx ^ prevIndx;
                    thisIndx = thisIndx ^ prevIndx;
					thisIndx--;
                } else {
					prevIndx++;
				}
                var rows = [];
                for (; prevIndx <= thisIndx; prevIndx++) {
                    var row = self.rowFactory.rowCache[prevIndx];
                    if (!row) row = {
                        entity: self.rowFactory.parsedData[prevIndx] || grid.filteredData.peek()[prevIndx]
                    };
                    rows.push(row);
                }
                if (rowItem.beforeSelectionChange(rows, evt)) {
                    $.each(rows, function(i, ri) {
						if (ri.entity != undefined) {
							if (ri.selected) ri.selected(true);
							ri.entity[SELECTED_PROP](true);
							if (self.selectedItems().indexOf(ri.entity) === -1) {
								self.selectedItems.peek().push(ri.entity);
							}
						}
                    });
                    self.selectedItems.notifySubscribers(self.selectedItems());
                    rows[rows.length - 1].afterSelectionChange(rows, evt);
                }
                self.lastClickedRow = rows[rows.length - 1];
                grid.$$selectionPhase = false;
                return true;
            }
        } else if (!self.multi) {
            if (self.lastClickedRow && self.lastClickedRow != rowItem) {
                self.setSelection(self.lastClickedRow, false);
            }
            self.setSelection(rowItem, grid.config.keepLastSelected ? true : !rowItem.selected());
        } else {
            self.setSelection(rowItem, !rowItem.selected());
        }
        self.lastClickedRow = rowItem;
        grid.$$selectionPhase = false;
        return true;
    };

    self.setCellSelection = function (rowItem, column, isSelected) {
        var field = column.field;
        if (isSelected) {
            rowItem.cellSelection.push(field);
            self.selectedCells.push({
                entity: rowItem.entity,
                column: column,
                field: field
            });
        } else {
            var index = rowItem.cellSelection().indexOf(field);
            rowItem.cellSelection.splice(index, 1);
            self.selectedCells(self.selectedCells().filter(function (a) {
                return !(a.entity == rowItem.entity && a.field == field);
            }));
        }
        rowItem.entity[CELLSELECTED_PROP] = rowItem.cellSelection();
        if (rowItem.cellSelection().length) self.setSelection(rowItem, true);
        else self.setSelection(rowItem, false);
    };

    self.updateCellSelection = function (rowItem, cellSelection) {
        if (cellSelection instanceof Array) {
            var cellsToSelect = cellSelection.concat();
            cellSelection.length = 0;
            cellsToSelect.forEach(function (a) {
                var column = grid.columns.peek().filter(function (b) {
                    return a == b.field;
                })[0];
                if (column) {
                    self.setCellSelection(rowItem, column, true);
                }
            });
        }
    };
    // just call this func and hand it the rowItem you want to select (or de-select)    
    self.setSelection = function(rowItem, isSelected) {
        self.setSelectionQuiet(rowItem, isSelected);
        if (!isSelected) {
            var indx = self.selectedItems.indexOf(rowItem.entity);
			//VERESOV: fix for case when element is removed from selected elements collection
			if (indx >= 0) {
            if (indx != -1) self.selectedItems.splice(indx, 1);
			}
        } else {
            if (self.selectedItems.indexOf(rowItem.entity) === -1) {
                self.selectedItems.push(rowItem.entity);
            }
        }
    };

    self.setSelectionQuiet = function (rowItem, isSelected) {
        if (ko.isObservable(rowItem.selected)) rowItem.selected(isSelected);
        rowItem.entity[SELECTED_PROP](isSelected);
        if (!isSelected) rowItem.cellSelection([]);
    };
    
    // @return - boolean indicating if all items are selected or not
    // @val - boolean indicating whether to select all/de-select all
    self.toggleSelectAll = function (checkAll) {
        var selected = self.selectedItems();
        if (selected.length) {
            self.selectedItems([]);
        }
        $.each(grid.filteredData(), function (i, item) {
            item[SELECTED_PROP](checkAll);

            if (checkAll) {
                selected.push(item);
            }
        });

        $.each(self.rowFactory.rowCache, function (i, row) {
            if (row && row.selected) {
                row.selected(checkAll);
            }
        });

        self.selectedItems.valueHasMutated();
    };

    self.getEntitySelection = function (items) {
        if (!items) items = self.selectedItems();
        var result = [];
        items.forEach(function (a) {
            if (a.isAggRow) {
                var children = a.children.length ? a.children : a.aggChildren;
                result = result.concat(self.getEntitySelection(children));
            } else {
                result.push(a);
            }
        });
        return result;
    };

    self.RemoveSelectedRows = function () {
        var itemsToDelete = self.getEntitySelection();
        grid.sortedData(grid.sortedData().filter(function (a) {
            return itemsToDelete.indexOf(a) == -1;
        }));
    };
};

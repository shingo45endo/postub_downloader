DOCSDIR := docs
DOCHTML := index.html
DOCCSS := style.css
COPYFILES := $(DOCCSS) postub_downloader.js postub_downloader.gif
TARGETS := $(addprefix $(DOCSDIR)/, $(DOCHTML) $(DOCCSS) $(COPYFILES))

PANDOC = pandoc

.PHONY: all clean

all: $(DOCSDIR) $(TARGETS)

clean:
	rm -f $(TARGETS)
	rmdir $(DOCSDIR)

$(TARGETS): | $(DOCSDIR)

$(DOCSDIR):
	mkdir $(DOCSDIR)

$(DOCSDIR)/$(DOCHTML): README.md
	$(PANDOC) -s --smart --columns=10000 -r markdown_github -w html5 -c $(DOCCSS) $^ -o $@

$(COPYFILES:%=$(DOCSDIR)/%): $(DOCSDIR)/% : %
	cp $< $@
